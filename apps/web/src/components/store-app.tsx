"use client";

import * as React from "react";
import {
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Download,
  ExternalLink,
  Github,
  Paintbrush,
  Package,
  RefreshCw,
  Search,
  Send,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";
import {ADDON_TYPES, type Addon, type AddonType, type CatalogResponse, fallbackCatalog} from "@/lib/catalog";
import {cn} from "@/lib/utils";

type FilterType = "all" | AddonType;

type SubmissionState = {
  status: "idle" | "submitting" | "success" | "error";
  message: string;
};

const filters: Array<{value: FilterType; label: string}> = [
  {value: "all", label: "All"},
  {value: "plugin", label: "Plugins"},
  {value: "theme", label: "Themes"},
  {value: "skill", label: "Skills"},
];

const typeMeta: Record<
  AddonType,
  {
    label: string;
    icon: LucideIcon;
    tone: string;
  }
> = {
  plugin: {
    label: "Plugin",
    icon: Wrench,
    tone: "bg-primary/10 text-primary border-primary/25",
  },
  theme: {
    label: "Theme",
    icon: Paintbrush,
    tone: "bg-amber-500/10 text-amber-200 border-amber-400/25",
  },
  skill: {
    label: "Skill",
    icon: BookOpenCheck,
    tone: "bg-sky-500/10 text-sky-200 border-sky-400/25",
  },
};

export function StoreApp() {
  const [addons, setAddons] = React.useState<Addon[]>(fallbackCatalog);
  const [query, setQuery] = React.useState("");
  const [activeType, setActiveType] = React.useState<FilterType>("all");
  const [loading, setLoading] = React.useState(true);
  const [catalogMessage, setCatalogMessage] = React.useState("Loading hosted Store API");
  const [submissionType, setSubmissionType] = React.useState<AddonType>("plugin");
  const [submission, setSubmission] = React.useState<SubmissionState>({
    status: "idle",
    message: "",
  });

  const loadCatalog = React.useCallback(async () => {
    setLoading(true);
    setCatalogMessage("Loading hosted Store API");
    try {
      const response = await fetch("/api/addons", {
        headers: {"accept": "application/json"},
      });
      if (!response.ok) {
        throw new Error(`Store API returned ${response.status}`);
      }
      const payload = (await response.json()) as CatalogResponse;
      setAddons(payload.addons ?? []);
      setCatalogMessage(
        `Schema ${payload.schemaVersion} generated ${formatDate(payload.generatedAt)}`,
      );
    } catch (error) {
      setAddons(fallbackCatalog);
      setCatalogMessage(
        error instanceof Error
          ? `Showing bundled seed catalog: ${error.message}`
          : "Showing bundled seed catalog",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleAddons = addons.filter((addon) => {
    if (activeType !== "all" && addon.type !== activeType) {
      return false;
    }
    const haystack = [
      addon.name,
      addon.description,
      addon.author,
      addon.fileName,
      ...addon.tags,
    ]
      .join(" ")
      .toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  const counts = React.useMemo(() => {
    const next: Record<FilterType, number> = {
      all: addons.length,
      plugin: 0,
      theme: 0,
      skill: 0,
    };
    for (const addon of addons) {
      next[addon.type] += 1;
    }
    return next;
  }, [addons]);

  async function submitAddon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmission({status: "submitting", message: "Validating submission"});

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      type: submissionType,
      author: String(formData.get("author") ?? ""),
      version: String(formData.get("version") ?? "0.1.0"),
      fileName: String(formData.get("fileName") ?? ""),
      downloadUrl: String(formData.get("downloadUrl") ?? ""),
      sourceUrl: String(formData.get("sourceUrl") || formData.get("downloadUrl") || ""),
      homepageUrl: String(formData.get("homepageUrl") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      description: String(formData.get("description") ?? ""),
    };

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
        issue?: {url?: string};
      };
      if (!response.ok) {
        throw new Error(result.message || result.error || "Submission failed");
      }
      setSubmission({
        status: "success",
        message: result.issue?.url
          ? `Submitted for review: ${result.issue.url}`
          : "Submission validated. Review queue is not configured in this environment.",
      });
      form.reset();
      setSubmissionType("plugin");
    } catch (error) {
      setSubmission({
        status: "error",
        message: error instanceof Error ? error.message : "Submission failed",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3 no-underline">
            <img src="/assets/bettercodex-mark.svg" alt="" className="size-9 shrink-0 rounded-md" />
            <span className="text-base font-semibold tracking-normal">BetterCodex</span>
          </a>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Button variant="ghost" size="sm" asChild>
              <a href="#store">Store</a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="#submit">Submit</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/companion-inc/bettercodex" target="_blank" rel="noreferrer">
                <Github aria-hidden="true" />
                <span className="hidden sm:inline">GitHub</span>
                <span className="sr-only sm:hidden">GitHub</span>
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-5 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="grid gap-4">
            <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
              Community Store for Codex
            </Badge>
            <div className="grid max-w-3xl gap-3">
              <h1 className="text-4xl font-semibold tracking-normal text-balance sm:text-5xl">
                BetterCodex Store
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Community plugins, themes, and Codex skills for the local BetterCodex client.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-card p-2">
            <Metric label="Items" value={String(addons.length)} icon={Package} />
            <Metric label="Downloads" value={String(sum(addons, "downloads"))} icon={Download} />
            <Metric label="Likes" value={String(sum(addons, "likes"))} icon={CheckCircle2} />
          </div>
        </section>

        <section id="store" className="grid scroll-mt-20 gap-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,440px)_1fr] lg:items-end">
            <div className="grid gap-2">
              <Label htmlFor="store-search">Search Store</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="store-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search mods, authors, tags"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {loading ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                <span>{catalogMessage}</span>
              </div>
              <Button variant="outline" size="sm" onClick={loadCatalog} disabled={loading}>
                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <Tabs value={activeType} onValueChange={(value) => setActiveType(value as FilterType)}>
            <TabsList className="grid h-auto w-full grid-cols-4 sm:inline-flex sm:w-fit">
              {filters.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value} className="gap-2">
                  {filter.label}
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {counts[filter.value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={activeType} forceMount className="mt-3">
              {visibleAddons.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleAddons.map((addon) => (
                    <AddonCard key={addon.id} addon={addon} />
                  ))}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle>No Store items match this view</CardTitle>
                    <CardDescription>Change the search text or selected type.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </section>

        <section id="submit" className="grid scroll-mt-20 gap-5 border-t pt-8 lg:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1.2fr)]">
          <div className="grid h-fit gap-3">
            <Badge variant="outline" className="w-fit">
              <Upload className="size-3" />
              Submit
            </Badge>
            <h2 className="text-2xl font-semibold tracking-normal">Submit to the Store</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Submissions are validated by the hosted API and opened for review when review automation is configured.
            </p>
          </div>

          <Card>
            <form onSubmit={submitAddon}>
              <CardHeader>
                <CardTitle>Add-on details</CardTitle>
                <CardDescription>Use raw GitHub URLs for installable files.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="name">
                    <Input id="name" name="name" required placeholder="Hello Codex" />
                  </Field>
                  <Field label="Type" htmlFor="type-trigger">
                    <Select value={submissionType} onValueChange={(value) => setSubmissionType(value as AddonType)}>
                      <SelectTrigger id="type-trigger">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ADDON_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {typeMeta[type].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Author" htmlFor="author">
                    <Input id="author" name="author" required placeholder="Companion" />
                  </Field>
                  <Field label="Version" htmlFor="version">
                    <Input id="version" name="version" required defaultValue="0.1.0" />
                  </Field>
                </div>

                <Field label="File name" htmlFor="fileName">
                  <Input id="fileName" name="fileName" required placeholder="hello-codex.plugin.js" />
                </Field>

                <Field label="Raw download URL" htmlFor="downloadUrl">
                  <Input
                    id="downloadUrl"
                    name="downloadUrl"
                    required
                    type="url"
                    placeholder="https://raw.githubusercontent.com/org/repo/main/addon.plugin.js"
                  />
                </Field>

                <Field label="Source URL" htmlFor="sourceUrl">
                  <Input
                    id="sourceUrl"
                    name="sourceUrl"
                    type="url"
                    placeholder="https://github.com/org/repo/tree/main/addon.plugin.js"
                  />
                </Field>

                <Field label="Homepage URL" htmlFor="homepageUrl">
                  <Input id="homepageUrl" name="homepageUrl" type="url" placeholder="https://github.com/org/repo" />
                </Field>

                <Field label="Tags" htmlFor="tags">
                  <Input id="tags" name="tags" placeholder="utility, developer" />
                </Field>

                <Field label="Description" htmlFor="description">
                  <Textarea id="description" name="description" required placeholder="What this add-on changes." />
                </Field>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  role="status"
                  className={cn(
                    "min-h-5 text-sm text-muted-foreground",
                    submission.status === "success" && "text-primary",
                    submission.status === "error" && "text-destructive",
                  )}
                >
                  {submission.message}
                </p>
                <Button type="submit" disabled={submission.status === "submitting"} className="sm:w-auto">
                  <Send className="size-4" />
                  {submission.status === "submitting" ? "Submitting" : "Submit"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="grid min-w-0 gap-2 rounded-md bg-background/45 p-3">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-xl font-semibold">{value}</span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

function AddonCard({addon}: {addon: Addon}) {
  const meta = typeMeta[addon.type];
  const Icon = meta.icon;
  const sourceHref = addon.sourceUrl || addon.homepageUrl || addon.downloadUrl;

  return (
    <Card className="min-h-[286px] justify-between">
      <CardHeader className="gap-4">
        <div className="flex items-start gap-3">
          <img
            src={addon.thumbnailUrl || "/assets/bettercodex-mark.svg"}
            alt=""
            className="size-11 shrink-0 rounded-md border bg-background"
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <CardTitle className="truncate text-lg">{addon.name}</CardTitle>
            <CardDescription className="truncate">
              {addon.author} · v{addon.version}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("shrink-0", meta.tone)}>
            <Icon className="size-3" />
            {meta.label}
          </Badge>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{addon.description}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {addon.tags.length ? (
            addon.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-md">
                {tag}
              </Badge>
            ))
          ) : (
            <Badge variant="secondary" className="rounded-md">
              untagged
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <span className="truncate">{addon.fileName}</span>
          <span className="truncate text-center">{addon.downloads} downloads</span>
          <span className="truncate text-right">{formatDate(addon.updatedAt)}</span>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="secondary" size="sm" asChild className="flex-1">
          <a href={sourceHref} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            Source
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild className="flex-1">
          <a href={addon.downloadUrl} target="_blank" rel="noreferrer">
            <ArrowUpRight className="size-4" />
            Raw file
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function sum(addons: Addon[], key: "downloads" | "likes") {
  return addons.reduce((total, addon) => total + Number(addon[key] || 0), 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}
