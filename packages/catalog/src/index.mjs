export const ADDON_TYPES = Object.freeze(["plugin", "theme", "skill"]);

export const DEFAULT_STORE_ENDPOINT = "https://bettercodex.companion.ai/api/addons";

export const TAGS = Object.freeze({
  plugin: ["workflow", "chat", "ui", "developer", "automation", "utility"],
  theme: ["dark", "light", "contrast", "layout", "editor", "minimal"],
  skill: ["authoring", "debugging", "research", "automation", "workflow", "deployment"],
});

// The marketplace launches empty — every mod comes from a community submission.
export const sampleCatalog = Object.freeze([]);

export function normalizeType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (!ADDON_TYPES.includes(normalized)) {
    throw new Error(`Unsupported addon type: ${type}`);
  }
  return normalized;
}

export function slugify(input) {
  const slug = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return slug || "addon";
}

export function normalizeAddon(addon) {
  if (!addon || typeof addon !== "object") {
    throw new Error("Addon must be an object");
  }

  const type = normalizeType(addon.type);
  const name = requiredString(addon.name, "name");
  const id = slugify(addon.id || name);
  const fileName = requiredString(addon.fileName, "fileName");
  assertFileName(type, fileName);

  const tags = Array.isArray(addon.tags)
    ? addon.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    id,
    type,
    name,
    description: requiredString(addon.description, "description"),
    author: requiredString(addon.author, "author"),
    version: requiredString(addon.version, "version"),
    tags,
    downloads: numberOrZero(addon.downloads),
    likes: numberOrZero(addon.likes),
    fileName,
    downloadUrl: requiredUrl(addon.downloadUrl, "downloadUrl"),
    sourceUrl: optionalUrl(addon.sourceUrl),
    homepageUrl: optionalUrl(addon.homepageUrl),
    thumbnailUrl: optionalUrl(addon.thumbnailUrl) || "/assets/bettercodex-mark.svg",
    updatedAt: normalizeDate(addon.updatedAt),
  };
}

export function validateCatalog(catalog) {
  if (!Array.isArray(catalog)) {
    throw new Error("Catalog must be an array");
  }
  const seen = new Set();
  return catalog.map((addon) => {
    const normalized = normalizeAddon(addon);
    if (seen.has(normalized.id)) {
      throw new Error(`Duplicate addon id: ${normalized.id}`);
    }
    seen.add(normalized.id);
    return normalized;
  });
}

export function validateSubmission(submission) {
  const addon = normalizeAddon({
    id: submission?.id || submission?.name,
    type: submission?.type,
    name: submission?.name,
    description: submission?.description,
    author: submission?.author,
    version: submission?.version || "0.1.0",
    tags: submission?.tags,
    fileName: submission?.fileName,
    downloadUrl: submission?.downloadUrl,
    sourceUrl: submission?.sourceUrl || submission?.downloadUrl,
    homepageUrl: submission?.homepageUrl,
    thumbnailUrl: submission?.thumbnailUrl,
    updatedAt: new Date().toISOString(),
  });

  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(addon.downloadUrl)) {
    throw new Error("downloadUrl must be a raw GitHub HTTPS URL");
  }
  return addon;
}

export function catalogResponse(catalog = sampleCatalog) {
  const addons = validateCatalog(catalog);
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    addons,
  };
}

function requiredString(value, field) {
  const string = String(value || "").trim();
  if (!string) {
    throw new Error(`${field} is required`);
  }
  return string;
}

function numberOrZero(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function optionalUrl(value) {
  if (!value) {
    return null;
  }
  return requiredUrl(value, "url");
}

function requiredUrl(value, field) {
  const url = requiredString(value, field);
  const parsed = new URL(url, "https://bettercodex.companion.ai");
  if (!["https:", "http:"].includes(parsed.protocol) && !url.startsWith("/")) {
    throw new Error(`${field} must be an HTTP(S) or absolute site URL`);
  }
  return url;
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("updatedAt must be a valid date");
  }
  return date.toISOString();
}

function assertFileName(type, fileName) {
  const suffix = type === "theme" ? ".theme.css" : type === "plugin" ? ".plugin.js" : ".skill.json";
  if (!fileName.endsWith(suffix)) {
    throw new Error(`${type} fileName must end with ${suffix}`);
  }
}
