import test from "node:test";
import assert from "node:assert/strict";

import worker from "../apps/api/worker.mjs";

test("Worker serves catalog response", async () => {
  const response = await worker.fetch(new Request("https://bettercodex.test/api/addons"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.addons[0].id, "hello-codex");
});

test("Worker validates submissions without GitHub token", async () => {
  const response = await worker.fetch(new Request("https://bettercodex.test/api/submit", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      author: "Companion",
      description: "Adds a command.",
      downloadUrl: "https://raw.githubusercontent.com/companion-inc/bettercodex/main/packages/addons/examples/plugins/hello-codex.plugin.js",
      fileName: "hello-codex.plugin.js",
      name: "Hello Codex",
      type: "plugin",
      version: "0.1.0",
    }),
  }), {});

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.mode, "validated");
});
