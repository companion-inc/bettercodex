const state = {
  addons: [],
  query: "",
  type: "all",
};

const catalog = document.querySelector("#catalog");
const search = document.querySelector("#search");
const segments = document.querySelectorAll("[data-type]");
const form = document.querySelector("#submission-form");
const submissionStatus = document.querySelector("#submission-status");

loadAddons();

search.addEventListener("input", (event) => {
  state.query = event.currentTarget.value.trim().toLowerCase();
  render();
});

for (const button of segments) {
  button.addEventListener("click", () => {
    state.type = button.dataset.type;
    for (const item of segments) {
      item.classList.toggle("active", item === button);
    }
    render();
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submissionStatus.textContent = "Validating submission...";
  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || result.error || "Submission failed");
    }
    submissionStatus.textContent = result.issue?.url
      ? `Submitted for review: ${result.issue.url}`
      : "Submission validated. Review queue is not configured in this environment.";
    form.reset();
  } catch (error) {
    submissionStatus.textContent = error.message;
  }
});

async function loadAddons() {
  catalog.textContent = "Loading Store...";
  try {
    const response = await fetch("/api/addons");
    if (!response.ok) {
      throw new Error(`Store API returned ${response.status}`);
    }
    const payload = await response.json();
    state.addons = payload.addons || [];
    render();
  } catch (error) {
    catalog.innerHTML = `<p class="meta">${escapeHtml(error.message)}</p>`;
  }
}

function render() {
  const query = state.query;
  const filtered = state.addons.filter((addon) => {
    if (state.type !== "all" && addon.type !== state.type) {
      return false;
    }
    const haystack = [
      addon.name,
      addon.description,
      addon.author,
      ...(addon.tags || []),
    ].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });

  if (!filtered.length) {
    catalog.innerHTML = `<p class="meta">No Store items match this view.</p>`;
    return;
  }

  catalog.innerHTML = filtered.map(renderCard).join("");
}

function renderCard(addon) {
  const tags = (addon.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  return `
    <article class="addon-card">
      <div class="addon-head">
        <img src="${escapeAttribute(addon.thumbnailUrl || "/assets/bettercodex-mark.svg")}" alt="">
        <div>
          <h3>${escapeHtml(addon.name)}</h3>
          <div class="meta">${escapeHtml(addon.type)} by ${escapeHtml(addon.author)}</div>
        </div>
      </div>
      <p>${escapeHtml(addon.description)}</p>
      <div class="tags">${tags}</div>
      <div class="meta">${Number(addon.downloads || 0)} downloads · ${Number(addon.likes || 0)} likes</div>
      <div class="actions">
        <a href="${escapeAttribute(addon.sourceUrl || addon.downloadUrl)}">Source</a>
        <a href="${escapeAttribute(addon.downloadUrl)}">Raw file</a>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
