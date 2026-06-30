import {useEffect, useMemo, useState} from "react";
import {
  Download,
  Github,
  LayoutGrid,
  PackageOpen,
  Palette,
  Plus,
  Puzzle,
  Search,
} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  type Addon,
  DOCS_URL,
  loadAddons,
  REPO_URL,
  SUBMIT_URL,
} from "@/lib/catalog";

type TypeFilter = "all" | "plugin" | "theme";
type SortKey = "popular" | "newest" | "name";

const TYPE_TABS: {key: TypeFilter; label: string}[] = [
  {key: "all", label: "All"},
  {key: "plugin", label: "Plugins"},
  {key: "theme", label: "Themes"},
];

const SORTS: {key: SortKey; label: string}[] = [
  {key: "popular", label: "Popular"},
  {key: "newest", label: "Newest"},
  {key: "name", label: "Name"},
];

function visual(addon: Addon) {
  if (addon.type === "theme") {
    return {Icon: Palette, fg: "#E7D9FF", bg: "#4A2F8F"};
  }
  return {Icon: Puzzle, fg: "#FFFFFF", bg: "#0285ff"};
}

function ModCard({addon}: {addon: Addon}) {
  const {Icon, fg, bg} = visual(addon);
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40">
      <div className="mb-3 flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
          style={{background: bg, color: fg}}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-medium text-foreground">
              {addon.name}
            </h3>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] capitalize text-secondary-foreground">
              {addon.type}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">by {addon.author}</p>
        </div>
      </div>
      <p className="mb-3 line-clamp-2 flex-1 text-[13px] leading-relaxed text-muted-foreground">
        {addon.description}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(addon.tags ?? []).slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="shrink-0 border-border"
        >
          <a href={addon.sourceUrl ?? addon.downloadUrl ?? REPO_URL}>
            <Download className="size-4" /> Get
          </a>
        </Button>
      </div>
    </div>
  );
}

function SubmitTile() {
  return (
    <a
      href={SUBMIT_URL}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent p-4 text-center text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
    >
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-secondary">
        <Plus className="size-5" />
      </span>
      <span className="text-[14px] font-medium">Submit your plugin</span>
      <span className="text-[12px]">Plugins and themes welcome</span>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <PackageOpen className="size-7" />
      </span>
      <h3 className="text-lg font-medium text-foreground">No plugins yet</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        Be the first to publish a plugin or theme for Codex. Add-ons are
        added by opening a pull request to the community plugins repo — it's validated
        by CI and reviewed on GitHub.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <a href={SUBMIT_URL}>
            <Plus className="size-4" /> Submit the first plugin
          </a>
        </Button>
        <Button asChild variant="outline" className="border-border">
          <a href={DOCS_URL}>Read the docs</a>
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("popular");

  useEffect(() => {
    loadAddons().then(setAddons);
  }, []);

  const filtered = useMemo(() => {
    const list = addons ?? [];
    const q = query.trim().toLowerCase();
    const matched = list.filter((addon) => {
      if (type !== "all" && addon.type !== type) return false;
      if (!q) return true;
      const hay = [addon.name, addon.author, addon.description, ...(addon.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return matched.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "newest") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      return (b.downloads ?? 0) - (a.downloads ?? 0) || a.name.localeCompare(b.name);
    });
  }, [addons, query, type, sort]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutGrid className="size-4" />
            </span>
            <span className="text-[15px] font-medium">BetterCodex</span>
          </a>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <a href="#plugins" className="text-foreground transition-colors hover:text-foreground">
              Plugins
            </a>
            <a href={DOCS_URL} className="transition-colors hover:text-foreground">
              Docs
            </a>
            <a href={REPO_URL} aria-label="GitHub" className="transition-colors hover:text-foreground">
              <Github className="size-[18px]" />
            </a>
            <Button asChild size="sm">
              <a href={REPO_URL}>Get BetterCodex</a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-12 sm:py-16">
          <h1 className="max-w-2xl text-[34px] font-medium leading-[1.1] tracking-tight sm:text-[42px]">
            Plugins and themes for Codex
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            A community marketplace of plugins and themes for the Codex desktop app. Browse,
            install in one click, and build your own.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href={REPO_URL}>
                <Download className="size-4" /> Get BetterCodex
              </a>
            </Button>
            <Button asChild variant="outline" className="border-border">
              <a href={SUBMIT_URL}>
                <Plus className="size-4" /> Submit a plugin
              </a>
            </Button>
          </div>
        </section>

        <section id="plugins" className="pb-20">
          {addons !== null && addons.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search plugins"
                className="h-10 border-border bg-card pl-9"
              />
            </div>

            <div className="flex gap-0.5 rounded-lg border border-border bg-card p-1">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setType(tab.key)}
                  className={
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors " +
                    (type === tab.key
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          )}

          {addons === null ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Loading plugins…</p>
          ) : addons.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No plugins match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((addon) => (
                <ModCard key={addon.id} addon={addon} />
              ))}
              <SubmitTile />
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-[13px] text-muted-foreground">
          <span>A BetterDiscord-style plugin platform for Codex.</span>
          <div className="flex items-center gap-5">
            <a href={DOCS_URL} className="transition-colors hover:text-foreground">
              Docs
            </a>
            <a href={SUBMIT_URL} className="transition-colors hover:text-foreground">
              Submit a plugin
            </a>
            <a href={REPO_URL} className="transition-colors hover:text-foreground">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
