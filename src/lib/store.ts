import { promises as fs } from "node:fs";
import path from "node:path";
import { companyKey, normalizeTitle } from "./text";
import type { Company, CrawlRun, FundingEvent, Job, RawJob, StoreData } from "./types";

/**
 * Local JSON store. It is the source of truth until Supabase is connected
 * (schema in supabase/migrations). Keeps crawl history so we can tell how long
 * a job has really been open and whether it keeps getting reposted.
 */
export const STORE_PATH = path.join(process.cwd(), "data", "store.json");

export function emptyStore(): StoreData {
  return { version: 1, jobs: {}, titleHistory: {}, companies: {}, funding: {}, runs: [] };
}

export async function loadStore(file = STORE_PATH): Promise<StoreData> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as StoreData;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw e;
  }
}

export async function saveStore(data: StoreData, file = STORE_PATH): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

/** Which crawl a job belongs to: a whole feed, or one company's board. */
export function scopeOf(job: Pick<RawJob, "source" | "company">): string {
  return job.source === "ashby" || job.source === "greenhouse" || job.source === "lever"
    ? `${job.source}:${companyKey(job.company)}`
    : job.source;
}

const PRUNE_CLOSED_AFTER_DAYS = 90;

/**
 * Merges one crawl into the store.
 * @param okScopes scopes that crawled successfully — only their unseen jobs get closed,
 *                 so a failed request never wrongly marks jobs as closed.
 */
export function applyCrawl(store: StoreData, raw: RawJob[], okScopes: Set<string>, now = new Date()): StoreData {
  const nowIso = now.toISOString();
  const seen = new Set<string>();

  for (const r of raw) {
    seen.add(r.id);
    const key = companyKey(r.company);
    const existing = store.jobs[r.id];
    if (existing) {
      store.jobs[r.id] = { ...existing, ...r, companyKey: key, lastSeenAt: nowIso, closedAt: undefined };
      continue;
    }
    const tKey = `${key}|${normalizeTitle(r.title)}`;
    const history = (store.titleHistory[tKey] ??= []);
    // A repost = an earlier posting with the same company+title that has since closed
    // (or been pruned). Simultaneous postings for different cities don't count.
    const previous = history.filter((id) => id !== r.id && (!store.jobs[id] || store.jobs[id].closedAt));
    history.push(r.id);
    store.jobs[r.id] = {
      ...r,
      companyKey: key,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      repostCount: previous.length,
    };
  }

  for (const job of Object.values(store.jobs)) {
    if (!seen.has(job.id) && !job.closedAt && okScopes.has(scopeOf(job))) job.closedAt = nowIso;
  }

  const cutoff = now.getTime() - PRUNE_CLOSED_AFTER_DAYS * 86_400_000;
  for (const [id, job] of Object.entries(store.jobs)) {
    if (job.closedAt && Date.parse(job.closedAt) < cutoff) delete store.jobs[id];
  }
  return store;
}

export function upsertCompanies(store: StoreData, companies: Company[]): void {
  for (const c of companies) {
    const prev = store.companies[c.key];
    store.companies[c.key] = prev
      ? { ...prev, ...c, sources: [...new Set([...prev.sources, ...c.sources])] }
      : c;
  }
}

export function upsertFunding(store: StoreData, events: FundingEvent[]): void {
  for (const f of events) store.funding[f.id] = f;
}

export function recordRun(store: StoreData, run: CrawlRun): void {
  store.runs = [run, ...store.runs].slice(0, 60);
}

export function openJobs(store: StoreData): Job[] {
  return Object.values(store.jobs).filter((j) => !j.closedAt);
}
