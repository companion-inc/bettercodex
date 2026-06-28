import {
  catalogResponse,
  sampleCatalog,
  validateSubmission,
} from "../../packages/catalog/src/index.mjs";

const jsonHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {headers: jsonHeaders});
    }

    if (url.pathname === "/api/health") {
      return json({ok: true, service: "bettercodex-store"});
    }

    if (url.pathname === "/api/addons" && request.method === "GET") {
      return json(catalogResponse(sampleCatalog));
    }

    if (url.pathname.startsWith("/api/addons/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/addons/".length));
      const addons = catalogResponse(sampleCatalog).addons;
      const addon = addons.find((item) => item.id === id || item.name.toLowerCase() === id.toLowerCase());
      return addon ? json(addon) : json({error: "not_found"}, 404);
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmission(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({error: "not_found"}, 404);
  },
};

async function handleSubmission(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({error: "invalid_json"}, 400);
  }

  let submission;
  try {
    submission = validateSubmission(body);
  } catch (error) {
    return json({error: "invalid_submission", message: error.message}, 400);
  }

  if (!env.GITHUB_TOKEN) {
    return json({
      ok: true,
      mode: "validated",
      submission,
    }, 202);
  }

  try {
    const issue = await createSubmissionIssue(env, submission);
    return json({ok: true, mode: "issue", issue, submission}, 201);
  } catch (error) {
    return json({error: "review_queue_failed", message: error.message}, 502);
  }
}

async function createSubmissionIssue(env, submission) {
  const repo = env.GITHUB_REPO || "companion-inc/bettercodex";
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "bettercodex-store",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      title: `Store submission: ${submission.name}`,
      labels: ["store-submission", submission.type],
      body: [
        `Name: ${submission.name}`,
        `Type: ${submission.type}`,
        `Author: ${submission.author}`,
        `Version: ${submission.version}`,
        `File: ${submission.fileName}`,
        `Download: ${submission.downloadUrl}`,
        submission.sourceUrl ? `Source: ${submission.sourceUrl}` : null,
        "",
        submission.description,
      ].filter(Boolean).join("\n"),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `GitHub issue creation failed with ${response.status}`);
  }
  return {
    number: payload.number,
    url: payload.html_url,
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: jsonHeaders,
  });
}
