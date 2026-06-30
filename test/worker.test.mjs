import test from "node:test";
import assert from "node:assert/strict";

import worker from "../apps/api/worker.mjs";

test("Worker serves catalog response", async () => {
  const response = await worker.fetch(new Request("https://bettercodex.test/api/addons"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.schemaVersion, 1);
  // Catalog contents come from the bettercodex-plugins repo at runtime; assert the shape.
  assert.ok(Array.isArray(payload.addons));
  assert.equal(payload.addons.some((addon) => addon.type === "skill"), false);
});

test("Worker validates submissions without GitHub token", async () => {
  const response = await worker.fetch(new Request("https://bettercodex.test/api/submit", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      author: "Companion",
      description: "Improves focus rings and active control contrast.",
      downloadUrl: "https://raw.githubusercontent.com/companion-inc/bettercodex/main/packages/addons/examples/themes/focus-contrast.theme.css",
      fileName: "focus-contrast.theme.css",
      name: "Focus Contrast",
      type: "theme",
      version: "0.1.0",
    }),
  }), {});

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mode, "validated");
});

test("Worker sends submission issues to the community plugin repo by default", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({number: 7, html_url: "https://github.com/companion-inc/bettercodex-plugins/issues/7"}), {
      status: 201,
      headers: {"content-type": "application/json"},
    });
  };

  try {
    const response = await worker.fetch(new Request("https://bettercodex.test/api/submit", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({
        author: "Companion",
        description: "Improves focus rings and active control contrast.",
        downloadUrl: "https://raw.githubusercontent.com/companion-inc/bettercodex/main/packages/addons/examples/themes/focus-contrast.theme.css",
        fileName: "focus-contrast.theme.css",
        name: "Focus Contrast",
        type: "theme",
        version: "0.1.0",
      }),
    }), {GITHUB_TOKEN: "test-token"});

    assert.equal(response.status, 201);
    assert.equal(requestedUrl, "https://api.github.com/repos/companion-inc/bettercodex-plugins/issues");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
