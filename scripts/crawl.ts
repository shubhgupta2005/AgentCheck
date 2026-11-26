/**
 * Crawls every source, merges into the store (keeping history), and prints a summary.
 *   npm run crawl
 */
import boardsConfig from "../config/boards.json";
import { buildRadar } from "../src/lib/radar";
import { crawlBoard, type BoardConfig } from "../src/lib/sources/ats-boards";
import { crawlFunding } from "../src/lib/sources/funding";
import { crawlHn } from "../src/lib/sources/hn";
import { crawlRemoteOk, crawlRemotive } from "../src/lib/sources/remote-boards";
import { crawlYc } from "../src/lib/sources/yc";
import {
  applyCrawl,
  loadStore,
  recordRun,
  saveStore,
  scopeOf,
  storeBackend,
  upsertCompanies,
  upsertFunding,
} from "../src/lib/store";
import type { RawJob, SourceId } from "../src/lib/types";

async function main() {
  console.log(`Store: ${storeBackend()}`);
  if (process.env.REQUIRE_SUPABASE && storeBackend() !== "supabase") {
    throw new Error(
      "REQUIRE_SUPABASE is set but SUPABASE_URL / SUPABASE_SECRET_KEY are missing. " +
        "Add both as repository secrets: Settings → Secrets and variables → Actions → Repository secrets.",
    );
  }
  const store = await loadStore();
  const loadedJobIds = new Set(Object.keys(store.jobs));
  const now = new Date();
  const raw: RawJob[] = [];
  const okScopes = new Set<string>();
  const counts: Partial<Record<SourceId, number>> = {};
  const errors: string[] = [];

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    const t = Date.now();
    try {
      const out = await fn();
      console.log(`✓ ${label} (${Date.now() - t}ms)`);
      return out;
    } catch (e) {
      const msg = `${label}: ${(e as Error).message}`;
      errors.push(msg);
      console.warn(`✗ ${msg}`);
      return undefined;
    }
  }

  const feeds: [SourceId, () => Promise<RawJob[]>][] = [
    ["hn", crawlHn],
    ["remotive", crawlRemotive],
    ["remoteok", crawlRemoteOk],
  ];
  for (const [src, fn] of feeds) {
    const jobs = await run(src, fn);
    if (!jobs) continue;
    okScopes.add(src);
    raw.push(...jobs);
    counts[src] = jobs.length;
  }

  for (const b of boardsConfig.boards as BoardConfig[]) {
    const jobs = await run(`${b.ats}/${b.slug}`, () => crawlBoard(b));
    if (!jobs) continue;
    okScopes.add(scopeOf({ source: b.ats, company: b.company }));
    raw.push(...jobs);
    counts[b.ats] = (counts[b.ats] ?? 0) + jobs.length;
  }

  const yc = await run("yc", crawlYc);
  if (yc) {
    upsertCompanies(store, yc);
    counts.yc = yc.length;
  }
  const funding = await run("inc42", crawlFunding);
  if (funding) {
    upsertFunding(store, funding);
    counts.inc42 = funding.length;
  }

  applyCrawl(store, raw, okScopes, now);
  recordRun(store, { at: now.toISOString(), counts, errors });
  await saveStore(store, loadedJobIds);

  const radar = buildRadar(store, now);
  const byQ = radar.jobs.reduce<Record<string, number>>((m, j) => ((m[j.quadrant] = (m[j.quadrant] ?? 0) + 1), m), {});
  console.log("\nCrawled:", counts);
  console.log(`Feed: ${radar.jobs.length} India-friendly tech jobs`, byQ);
  console.log(`Company leads: ${radar.companies.length}`);
  console.log("\nTop 5 to apply now:");
  for (const j of radar.jobs.filter((j) => j.quadrant === "apply_now").slice(0, 5)) {
    console.log(`  ${j.reply.score}  ${j.company} — ${j.title}  [${j.reply.reasons.slice(0, 2).map((r) => r.text).join("; ")}]`);
  }
  if (errors.length) console.log("\nErrors:", errors);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
