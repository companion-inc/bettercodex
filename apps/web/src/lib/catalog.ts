import seed from "./catalog.seed.json";

export type AddonType = "plugin" | "theme";

export interface Addon {
  id: string;
  type: AddonType;
  name: string;
  description: string;
  author: string;
  version?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  downloadUrl?: string;
  sourceUrl?: string;
  homepageUrl?: string;
  updatedAt?: string;
}

const SEED = seed as Addon[];

export async function loadAddons(): Promise<Addon[]> {
  try {
    const res = await fetch("/api/addons", {headers: {"cache-control": "no-cache"}});
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.addons;
      if (Array.isArray(list)) return onlyRuntimeAddons(list);
    }
  } catch {
    // No Worker in local dev — fall back to the bundled seed.
  }
  return onlyRuntimeAddons(SEED);
}

function onlyRuntimeAddons(list: unknown[]): Addon[] {
  return (list as Addon[]).filter((addon) => addon.type === "plugin" || addon.type === "theme");
}

export const REPO_URL = "https://github.com/companion-inc/bettercodex";
export const COMMUNITY_REPO_URL = "https://github.com/companion-inc/bettercodex-plugins";
export const DOCS_URL = "https://github.com/companion-inc/bettercodex-plugins/tree/main/docs";
// Submitting a plugin is a pull request to the community plugins repo, not an issue.
export const SUBMIT_URL =
  "https://github.com/companion-inc/bettercodex-plugins/blob/main/CONTRIBUTING.md";
