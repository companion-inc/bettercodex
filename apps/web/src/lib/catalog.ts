import seed from "./catalog.seed.json";

export type AddonType = "plugin" | "theme" | "skill";

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
      if (Array.isArray(list)) return list as Addon[];
    }
  } catch {
    // No Worker in local dev — fall back to the bundled seed.
  }
  return SEED;
}

export const REPO_URL = "https://github.com/companion-inc/bettercodex";
export const STORE_URL = "https://github.com/companion-inc/bettercodex-mods";
export const DOCS_URL = "https://github.com/companion-inc/bettercodex-mods/tree/main/docs";
// Submitting a mod is a pull request to the community mods repo, not an issue.
export const SUBMIT_URL =
  "https://github.com/companion-inc/bettercodex-mods/blob/main/CONTRIBUTING.md";
