"use client";

import { useMemo, useState } from "react";
import type { CompanyLead } from "@/lib/radar";
import type { Quadrant, Scored, SourceId } from "@/lib/types";

export interface ClientJob extends Scored {
  id: string;
  source: SourceId;
  company: string;
  title: string;
  url: string;
  applyUrl?: string;
  applyEmail?: string;
  location: string;
  salary?: string;
  preview: string;
}

export interface ClientRadar {
  jobs: ClientJob[];
  companies: CompanyLead[];
  lastCrawl?: string;
  sources: Record<string, number>;
}

const QUADRANTS: { id: Quadrant; label: string; hint: string; tone: string }[] = [
  { id: "apply_now", label: "Apply now", hint: "Actively hiring · quick to apply", tone: "emerald" },
  { id: "worth_effort", label: "Worth the effort", hint: "Actively hiring · long form", tone: "sky" },
  { id: "low_odds", label: "Low odds", hint: "Weak hiring signals · quick", tone: "amber" },
  { id: "skip", label: "Skip", hint: "Weak signals · long form", tone: "rose" },
];

const TONE: Record<string, { ring: string; badge: string; dot: string }> = {
  emerald: {
    ring: "ring-emerald-500/60 bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  sky: { ring: "ring-sky-500/60 bg-sky-500/5", badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  amber: {
    ring: "ring-amber-500/60 bg-amber-500/5",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  rose: { ring: "ring-rose-500/60 bg-rose-500/5", badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
};

const SOURCE_LABEL: Record<SourceId, string> = {
  hn: "HN Who's Hiring",
  remotive: "Remotive",
  remoteok: "Remote OK",
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever",
  yc: "YC",
  inc42: "Inc42",
};

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-sky-600 dark:text-sky-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function RadarView({ data }: { data: ClientRadar }) {
  const [tab, setTab] = useState<"jobs" | "companies">("jobs");
  const [quadrant, setQuadrant] = useState<Quadrant>("apply_now");
  const [fresherOnly, setFresherOnly] = useState(true);
  const [query, setQuery] = useState("");

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.jobs.filter(
      (j) =>
        (!fresherOnly || j.fresherFriendly) &&
        (!q || `${j.company} ${j.title} ${j.location}`.toLowerCase().includes(q)),
    );
  }, [data.jobs, fresherOnly, query]);

  const counts = useMemo(() => {
    const c: Record<Quadrant, number> = { apply_now: 0, worth_effort: 0, low_odds: 0, skip: 0 };
    for (const j of pool) c[j.quadrant]++;
    return c;
  }, [pool]);

  const visible = pool.filter((j) => j.quadrant === quadrant);
  const empty = data.jobs.length === 0 && data.companies.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AgentCheck</h1>
          <p className="text-xs text-muted">
            Updated {timeAgo(data.lastCrawl)} ·{" "}
            {Object.entries(data.sources)
              .map(([s, n]) => `${SOURCE_LABEL[s as SourceId] ?? s} ${n}`)
              .join(" · ")}
          </p>
        </div>
        <p className="mt-2 max-w-2xl text-muted">
          Stop applying to 600 jobs. These are ranked by how likely the company is to <em>reply</em> to a student in
          India, with ghost listings flagged and the time each application takes.
        </p>
      </header>

      {empty ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="font-medium">No data yet</p>
          <p className="mt-1 text-sm text-muted">
            Run <code className="rounded bg-background px-1.5 py-0.5">npm run crawl</code> to fetch jobs, then reload.
          </p>
        </div>
      ) : (
        <>
          <nav className="mb-6 flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm" role="tablist">
            {(
              [
                ["jobs", `Jobs (${pool.length})`],
                ["companies", `Companies to reach out to (${data.companies.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 rounded-md px-3 py-2 font-medium transition ${
                  tab === id ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "jobs" ? (
            <>
              <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Quadrants">
                {QUADRANTS.map((q) => {
                  const t = TONE[q.tone];
                  const active = quadrant === q.id;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setQuadrant(q.id)}
                      className={`rounded-xl border border-border bg-surface p-3 text-left transition ${
                        active ? `ring-2 ${t.ring}` : "hover:border-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                        <span className="text-sm font-semibold">{q.label}</span>
                        <span className="ml-auto text-lg font-semibold tabular-nums">{counts[q.id]}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{q.hint}</p>
                    </button>
                  );
                })}
              </section>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search company, role, city…"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={fresherOnly} onChange={(e) => setFresherOnly(e.target.checked)} />
                  Hide senior roles
                </label>
              </div>

              <ul className="space-y-3">
                {visible.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
                {visible.length === 0 && (
                  <li className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
                    Nothing in this bucket right now.
                  </li>
                )}
              </ul>
            </>
          ) : (
            <ul className="space-y-3">
              {data.companies.map((c) => (
                <LeadCard key={c.key} lead={c} />
              ))}
            </ul>
          )}

          <footer className="mt-10 text-xs text-muted">
            Sources: Hacker News “Who is hiring?”, <a className="underline" href="https://remoteok.com">Remote OK</a>,
            Remotive, company boards on Ashby / Greenhouse / Lever, the YC directory and Inc42 funding news. Scores are
            heuristics — every point is explained on the card.
          </footer>
        </>
      )}
    </main>
  );
}

function JobCard({ job: j }: { job: ClientJob }) {
  const [open, setOpen] = useState(false);
  const q = QUADRANTS.find((x) => x.id === j.quadrant)!;
  const apply = j.applyEmail ? `mailto:${j.applyEmail}` : (j.applyUrl ?? j.url);
  const shown = open ? j.reply.reasons : j.reply.reasons.slice(0, 3);

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex gap-4">
        <div className="w-14 shrink-0 text-center">
          <div className={`text-2xl font-semibold tabular-nums ${scoreColor(j.reply.score)}`}>{j.reply.score}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">reply odds</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-semibold">{j.title}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[q.tone].badge}`}>{q.label}</span>
          </div>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{j.company}</span>
            {j.location && <> · {j.location}</>}
            {j.salary && <> · {j.salary}</>}
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-border px-2 py-0.5" title={j.effort.reason}>
              ⏱ ~{j.effort.minutes} min · {j.effort.reason.split(" — ")[0]}
            </span>
            {j.ghost.flags.map((f) => (
              <span key={f} className="rounded-md bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300">
                👻 {f}
              </span>
            ))}
          </div>

          <ul className="mt-3 space-y-1 text-sm">
            {shown.map((r) => (
              <li key={r.text} className="flex gap-2">
                <span
                  className={`w-8 shrink-0 text-right tabular-nums ${
                    r.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
                <span className="text-muted">{r.text}</span>
              </li>
            ))}
          </ul>
          {j.reply.reasons.length > 3 && (
            <button onClick={() => setOpen(!open)} className="mt-1 text-xs text-muted underline">
              {open ? "Show less" : `Why this score? (${j.reply.reasons.length - 3} more)`}
            </button>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <a
              href={apply}
              target="_blank"
              rel="noopener"
              className="rounded-lg bg-foreground px-3 py-1.5 font-medium text-background hover:opacity-90"
            >
              {j.applyEmail ? `Email ${j.applyEmail}` : "Apply"}
            </a>
            <a href={j.url} target="_blank" rel="noopener" className="text-muted underline">
              View on {SOURCE_LABEL[j.source]}
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

function LeadCard({ lead: l }: { lead: CompanyLead }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{l.name}</h2>
        {l.funding && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Just raised
          </span>
        )}
      </div>
      {l.company?.oneLiner && <p className="text-sm text-muted">{l.company.oneLiner}</p>}
      <ul className="mt-2 space-y-0.5 text-sm">
        {l.why.map((w) => (
          <li key={w}>• {w}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {l.links.map((x) => (
          <a key={x.url} href={x.url} target="_blank" rel="noopener" className="text-muted underline">
            {x.label}
          </a>
        ))}
      </div>
    </li>
  );
}
