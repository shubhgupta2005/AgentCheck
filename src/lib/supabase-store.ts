import type { Company, CrawlRun, FundingEvent, Job, StoreData } from "./types";

/**
 * Supabase backend for the store, via the PostgREST API (no SDK needed).
 * Env (server-side only — never expose the secret key to the browser):
 *   SUPABASE_URL         https://<project>.supabase.co
 *   SUPABASE_SECRET_KEY  sb_secret_… (or a legacy service_role JWT)
 */
export interface SupabaseConfig {
  url: string;
  key: string;
}

export function supabaseConfig(env = process.env): SupabaseConfig | undefined {
  const url = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) return undefined;
  return { url: url.replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), key };
}

class Rest {
  constructor(private cfg: SupabaseConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { apikey: this.cfg.key, "content-type": "application/json", ...extra };
    // Legacy keys are JWTs and also go in Authorization; new sb_secret_ keys only need `apikey`.
    if (this.cfg.key.startsWith("eyJ")) h.authorization = `Bearer ${this.cfg.key}`;
    return h;
  }

  async request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
    const res = await fetch(`${this.cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: this.headers(init.headers),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }

  /** Reads every row, paging past PostgREST's 1000-row cap. */
  async selectAll<T>(table: string, query = "select=*"): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const res = await this.request(`${table}?${query}`, { headers: { range: `${from}-${from + page - 1}` } });
      const rows = (await res.json()) as T[];
      out.push(...rows);
      if (rows.length < page) return out;
    }
  }

  async upsert(table: string, rows: object[], onConflict: string, ignoreDuplicates = false): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      await this.request(`${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: { prefer: `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates,return=minimal` },
        body: JSON.stringify(rows.slice(i, i + 500)),
      });
    }
  }

  async insert(table: string, rows: object[]): Promise<void> {
    await this.request(table, { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(rows) });
  }

  async deleteIn(table: string, column: string, values: string[]): Promise<void> {
    for (let i = 0; i < values.length; i += 100) {
      const list = values
        .slice(i, i + 100)
        .map((v) => `"${v.replace(/"/g, '\\"')}"`)
        .join(",");
      await this.request(`${table}?${column}=in.(${encodeURIComponent(list)})`, { method: "DELETE" });
    }
  }
}

// ── Row mapping (snake_case tables ↔ camelCase types) ──

interface JobRow {
  id: string;
  source: Job["source"];
  company_key: string;
  company: string;
  title: string;
  url: string;
  apply_url: string | null;
  apply_email: string | null;
  location: string;
  remote: boolean;
  posted_at: string | null;
  salary: string | null;
  description: string;
  tags: string[];
  direct_post: boolean;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  repost_count: number;
}

export const toJobRow = (j: Job): JobRow => ({
  id: j.id,
  source: j.source,
  company_key: j.companyKey,
  company: j.company,
  title: j.title,
  url: j.url,
  apply_url: j.applyUrl ?? null,
  apply_email: j.applyEmail ?? null,
  location: j.location,
  remote: j.remote,
  posted_at: j.postedAt ?? null,
  salary: j.salary ?? null,
  description: j.description,
  tags: j.tags,
  direct_post: j.directPost ?? false,
  first_seen_at: j.firstSeenAt,
  last_seen_at: j.lastSeenAt,
  closed_at: j.closedAt ?? null, // explicit null so a reopened job clears closed_at
  repost_count: j.repostCount,
});

export const fromJobRow = (r: JobRow): Job => ({
  id: r.id,
  source: r.source,
  companyKey: r.company_key,
  company: r.company,
  title: r.title,
  url: r.url,
  applyUrl: r.apply_url ?? undefined,
  applyEmail: r.apply_email ?? undefined,
  location: r.location,
  remote: r.remote,
  postedAt: r.posted_at ?? undefined,
  salary: r.salary ?? undefined,
  description: r.description,
  tags: r.tags ?? [],
  directPost: r.direct_post || undefined,
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
  closedAt: r.closed_at ?? undefined,
  repostCount: r.repost_count,
});

interface CompanyRow {
  key: string;
  name: string;
  website: string | null;
  team_size: number | null;
  location: string | null;
  stage: string | null;
  yc_batch: string | null;
  yc_url: string | null;
  is_hiring: boolean;
  one_liner: string | null;
  sources: Company["sources"];
}

const toCompanyRow = (c: Company): CompanyRow & { updated_at: string } => ({
  key: c.key,
  name: c.name,
  website: c.website ?? null,
  team_size: c.teamSize ?? null,
  location: c.location ?? null,
  stage: c.stage ?? null,
  yc_batch: c.ycBatch ?? null,
  yc_url: c.ycUrl ?? null,
  is_hiring: c.isHiring ?? false,
  one_liner: c.oneLiner ?? null,
  sources: c.sources,
  updated_at: new Date().toISOString(),
});

const fromCompanyRow = (r: CompanyRow): Company => ({
  key: r.key,
  name: r.name,
  website: r.website ?? undefined,
  teamSize: r.team_size ?? undefined,
  location: r.location ?? undefined,
  stage: r.stage ?? undefined,
  ycBatch: r.yc_batch ?? undefined,
  ycUrl: r.yc_url ?? undefined,
  isHiring: r.is_hiring,
  oneLiner: r.one_liner ?? undefined,
  sources: r.sources ?? [],
});

interface FundingRow {
  id: string;
  company_key: string;
  company: string;
  headline: string;
  amount_text: string | null;
  amount_usd: number | null;
  round: string | null;
  announced_at: string;
  url: string;
  source: FundingEvent["source"];
}

const toFundingRow = (f: FundingEvent): FundingRow => ({
  id: f.id,
  company_key: f.companyKey,
  company: f.company,
  headline: f.headline,
  amount_text: f.amountText ?? null,
  amount_usd: f.amountUsd ?? null,
  round: f.round ?? null,
  announced_at: f.date,
  url: f.url,
  source: f.source,
});

const fromFundingRow = (r: FundingRow): FundingEvent => ({
  id: r.id,
  companyKey: r.company_key,
  company: r.company,
  headline: r.headline,
  amountText: r.amount_text ?? undefined,
  amountUsd: r.amount_usd ?? undefined,
  round: r.round ?? undefined,
  date: r.announced_at,
  url: r.url,
  source: r.source,
});

interface RunRow {
  ran_at: string;
  counts: CrawlRun["counts"];
  errors: string[];
}

// ── Public API ──

/**
 * @param forCrawl also load title history (only the crawler needs it for repost detection).
 */
export async function loadFromSupabase(cfg: SupabaseConfig, forCrawl = true): Promise<StoreData> {
  const db = new Rest(cfg);
  const [jobs, companies, funding, runs, titles] = await Promise.all([
    db.selectAll<JobRow>("jobs", forCrawl ? "select=*" : "select=*&closed_at=is.null"),
    db.selectAll<CompanyRow>("companies"),
    db.selectAll<FundingRow>("funding_events"),
    db.selectAll<RunRow>("crawl_runs", "select=ran_at,counts,errors&order=ran_at.desc&limit=60"),
    forCrawl ? db.selectAll<{ title_key: string; job_id: string }>("title_history", "select=title_key,job_id") : [],
  ]);

  const store: StoreData = { version: 1, jobs: {}, titleHistory: {}, companies: {}, funding: {}, runs: [] };
  for (const r of jobs) store.jobs[r.id] = fromJobRow(r);
  for (const r of companies) store.companies[r.key] = fromCompanyRow(r);
  for (const r of funding) store.funding[r.id] = fromFundingRow(r);
  for (const t of titles) (store.titleHistory[t.title_key] ??= []).push(t.job_id);
  store.runs = runs.map((r) => ({ at: r.ran_at, counts: r.counts, errors: r.errors }));
  return store;
}

/**
 * Writes the merged store back. `before` is the set of job ids that existed when loaded,
 * so jobs pruned by applyCrawl are deleted.
 */
export async function saveToSupabase(cfg: SupabaseConfig, store: StoreData, before: Set<string>): Promise<void> {
  const db = new Rest(cfg);
  const jobs = Object.values(store.jobs);

  await db.upsert("companies", Object.values(store.companies).map(toCompanyRow), "key");
  await db.upsert("funding_events", Object.values(store.funding).map(toFundingRow), "id");
  await db.upsert("jobs", jobs.map(toJobRow), "id");

  const titleRows = Object.entries(store.titleHistory).flatMap(([title_key, ids]) =>
    ids.filter((id) => store.jobs[id]).map((job_id) => ({ title_key, job_id })),
  );
  await db.upsert("title_history", titleRows, "title_key,job_id", true);

  const today = new Date().toISOString().slice(0, 10);
  const sightings = jobs.filter((j) => !j.closedAt).map((j) => ({ job_id: j.id, seen_on: today }));
  await db.upsert("job_sightings", sightings, "job_id,seen_on", true);

  const pruned = [...before].filter((id) => !store.jobs[id]);
  if (pruned.length) await db.deleteIn("jobs", "id", pruned);

  const run = store.runs[0];
  if (run) await db.insert("crawl_runs", [{ ran_at: run.at, counts: run.counts, errors: run.errors }]);
}
