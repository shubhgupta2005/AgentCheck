import { describe, expect, it } from "vitest";
import { quadrantOf, scoreJob } from "../score";
import { applyCrawl, emptyStore } from "../store";
import type { Job, RawJob } from "../types";

const NOW = new Date("2026-11-26T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function job(over: Partial<Job> = {}): Job {
  return {
    id: "lever:1",
    source: "lever",
    company: "Acme",
    companyKey: "acme",
    title: "Backend Engineering Intern",
    url: "https://jobs.lever.co/acme/1",
    applyUrl: "https://jobs.lever.co/acme/1/apply",
    location: "Bengaluru",
    remote: false,
    postedAt: daysAgo(2),
    description: "Build APIs with a small team. ".repeat(10),
    tags: [],
    firstSeenAt: daysAgo(2),
    lastSeenAt: NOW.toISOString(),
    repostCount: 0,
    ...over,
  };
}

describe("scoreJob", () => {
  it("ranks a fresh intern role at a tiny funded startup as apply-now", () => {
    const s = scoreJob(job(), {
      company: { key: "acme", name: "Acme", teamSize: 15, sources: ["yc"] },
      funding: { id: "f", company: "Acme", companyKey: "acme", headline: "", amountUsd: 5e6, date: daysAgo(20), url: "", source: "inc42" },
      openRoles: 2,
      now: NOW,
    });
    expect(s.quadrant).toBe("apply_now");
    expect(s.reply.score).toBeGreaterThanOrEqual(90);
    expect(s.reply.reasons.map((r) => r.text).join(" ")).toMatch(/Raised \$5M 20 days ago/);
  });

  it("flags a stale, reposted talent-pool listing as a ghost", () => {
    const s = scoreJob(
      job({ title: "Software Engineer", postedAt: daysAgo(200), firstSeenAt: daysAgo(200), repostCount: 2, description: "Join our talent pool. ".repeat(10) }),
      { openRoles: 1, now: NOW },
    );
    expect(s.ghost.risk).toBeGreaterThanOrEqual(50);
    expect(s.quadrant).toBe("low_odds");
    expect(s.ghost.flags.join(" ")).toMatch(/talent pool/);
  });

  it("uses first-seen date when a job's posted date gets refreshed", () => {
    const s = scoreJob(job({ postedAt: daysAgo(1), firstSeenAt: daysAgo(100) }), { openRoles: 1, now: NOW });
    expect(s.ghost.flags).toContain("Open 100 days");
  });

  it("puts Workday applications on the high-effort side", () => {
    const s = scoreJob(job({ applyUrl: "https://acme.wd1.myworkdayjobs.com/x" }), { openRoles: 1, now: NOW });
    expect(s.effort.level).toBe("high");
    expect(s.quadrant).toBe("worth_effort");
  });
});

describe("scam check", () => {
  it("penalises recruiters on personal webmail", () => {
    const s = scoreJob(job({ applyEmail: "jane.recruiting@outlook.com" }), { openRoles: 1, now: NOW });
    expect(s.ghost.flags.join(" ")).toMatch(/possible scam/);
    expect(s.reply.reasons.some((r) => r.delta === -20)).toBe(true);
  });
  it("trusts company-domain emails", () => {
    const s = scoreJob(job({ applyEmail: "jobs@acme.dev" }), { openRoles: 1, now: NOW });
    expect(s.reply.reasons.some((r) => /lands in a person/.test(r.text))).toBe(true);
  });
});

describe("quadrantOf", () => {
  it("maps the 2x2", () => {
    expect(quadrantOf(80, 0, "low")).toBe("apply_now");
    expect(quadrantOf(80, 0, "high")).toBe("worth_effort");
    expect(quadrantOf(30, 0, "low")).toBe("low_odds");
    expect(quadrantOf(80, 60, "high")).toBe("skip");
  });
});

describe("applyCrawl history", () => {
  const raw = (id: string, title = "Backend Engineer"): RawJob => ({
    id,
    source: "lever",
    company: "Acme",
    title,
    url: "",
    location: "Bengaluru",
    remote: false,
    description: "",
    tags: [],
  });
  const scopes = new Set(["lever:acme"]);

  it("closes jobs that disappear and counts reposts of the same title", () => {
    const store = emptyStore();
    applyCrawl(store, [raw("lever:1")], scopes, new Date(daysAgo(30)));
    applyCrawl(store, [], scopes, new Date(daysAgo(20)));
    expect(store.jobs["lever:1"].closedAt).toBeDefined();
    applyCrawl(store, [raw("lever:2")], scopes, NOW);
    expect(store.jobs["lever:2"].repostCount).toBe(1);
  });

  it("does not count simultaneous postings (e.g. two cities) as reposts", () => {
    const store = emptyStore();
    applyCrawl(store, [raw("lever:1"), raw("lever:2")], scopes, NOW);
    expect(store.jobs["lever:2"].repostCount).toBe(0);
  });

  it("never closes jobs from a source whose crawl failed", () => {
    const store = emptyStore();
    applyCrawl(store, [raw("lever:1")], scopes, new Date(daysAgo(1)));
    applyCrawl(store, [], new Set(), NOW);
    expect(store.jobs["lever:1"].closedAt).toBeUndefined();
  });

  it("keeps the original first-seen date", () => {
    const store = emptyStore();
    applyCrawl(store, [raw("lever:1")], scopes, new Date(daysAgo(10)));
    applyCrawl(store, [raw("lever:1")], scopes, NOW);
    expect(store.jobs["lever:1"].firstSeenAt).toBe(daysAgo(10));
  });
});
