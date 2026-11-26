import { detectChannel, EFFORT, freeMailRecruiter, ghostPhrases, locationFit, seniority } from "./classify";
import { daysBetween } from "./text";
import type { Company, FundingEvent, Job, Quadrant, Reason, Scored } from "./types";

export interface ScoreContext {
  company?: Company;
  /** Most recent funding event for this company, if any. */
  funding?: FundingEvent;
  /** Open roles this company currently has across sources. */
  openRoles: number;
  now: Date;
}

/** Reply likelihood at/above this (and low ghost risk) counts as "actively hiring". */
export const ACTIVE_THRESHOLD = 55;
const GHOST_THRESHOLD = 50;

function fmtUsd(n: number): string {
  return n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`;
}

/** How long the job has really been open: the earlier of "posted" and "first seen by our crawler". */
export function daysOpen(job: Pick<Job, "postedAt" | "firstSeenAt">, now: Date): number | undefined {
  const a = daysBetween(job.postedAt, now);
  const b = daysBetween(job.firstSeenAt, now);
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

export function scoreJob(job: Job, ctx: ScoreContext): Scored {
  const reasons: Reason[] = [];
  const add = (delta: number, text: string) => reasons.push({ delta, text });
  const flags: string[] = [];
  let ghost = 0;

  // ── Company size: small teams read every application ──
  const size = ctx.company?.teamSize;
  if (size !== undefined) {
    if (size <= 20) add(15, `Tiny team (${size} people) — founders read applications`);
    else if (size <= 60) add(12, `Small team (${size} people) — a human reviews applications`);
    else if (size <= 200) add(7, `Startup-sized team (${size} people)`);
    else if (size > 5000) add(-18, `Very large company (${size.toLocaleString()} people) — ATS-filtered, high volume`);
    else if (size > 1000) add(-10, `Large company (${size.toLocaleString()} people) — high applicant volume`);
  }
  if (ctx.company?.ycBatch) add(4, `YC-backed (${ctx.company.ycBatch})`);

  // ── Fresh funding = fresh hiring budget ──
  if (ctx.funding) {
    const d = daysBetween(ctx.funding.date, ctx.now) ?? 999;
    const amt = ctx.funding.amountUsd ? ` ${fmtUsd(ctx.funding.amountUsd)}` : "";
    if (d <= 90) add(15, `Raised${amt} ${d} days ago — hiring budget is fresh`);
    else if (d <= 180) add(8, `Raised${amt} ${Math.round(d / 30)} months ago`);
  }

  // ── Freshness ──
  const open = daysOpen(job, ctx.now);
  if (open !== undefined) {
    if (open <= 7) add(12, `Posted ${open === 0 ? "today" : `${open}d ago`} — early applicants get read`);
    else if (open <= 14) add(8, `Posted ${open}d ago`);
    else if (open <= 30) add(3, `Posted ${open}d ago`);
    else if (open <= 60) add(-4, `Open for ${open} days`);
    else if (open <= 120) {
      add(-15, `Open for ${open} days — likely stale`);
      ghost += 30;
      flags.push(`Open ${open} days`);
    } else {
      add(-25, `Open for ${open} days — probably not being filled`);
      ghost += 45;
      flags.push(`Open ${open} days`);
    }
  }

  // ── Who you reach ──
  const channel = detectChannel(job.applyUrl, job.applyEmail);
  if (job.directPost) add(8, "Posted directly by someone on the team");
  if (freeMailRecruiter(job.applyEmail)) {
    add(-20, "Hiring via a personal webmail address — verify the company before sharing documents");
    ghost += 30;
    flags.push("Personal email recruiter — possible scam");
  } else if (channel === "email") add(8, "Apply by email — lands in a person's inbox");

  // ── Can a fresher in India actually get this? ──
  const level = seniority(job.title);
  if (level === "fresher") add(10, "Fresher-friendly role");
  else if (level === "senior") add(-18, "Senior role — expects years of experience");

  const fit = locationFit(job.location, job.remote);
  if (fit === "india") add(5, "Located in India");
  else if (fit === "global_remote") add(3, "Remote — open worldwide");
  else if (fit === "restricted") add(-25, `Location restricted (${job.location || "remote, region-locked"})`);
  else add(-20, `Onsite outside India (${job.location || "unknown"})`);

  if (job.salary) add(3, "Salary listed upfront");

  // ── Ghost-job signals ──
  const phrases = ghostPhrases(`${job.title}\n${job.description}`);
  if (phrases.length) {
    add(-25, `"${phrases[0]}" — collecting resumes, not filling a seat`);
    ghost += 40;
    flags.push(`Says "${phrases[0]}"`);
  }
  if (job.repostCount > 0) {
    add(-Math.min(20, job.repostCount * 8), `Reposted ${job.repostCount}× — same role keeps reappearing`);
    ghost += Math.min(40, job.repostCount * 20);
    flags.push(`Reposted ${job.repostCount}×`);
  }
  if (size !== undefined && size < 100 && ctx.openRoles > Math.max(8, size * 0.5)) {
    add(-8, `${ctx.openRoles} open roles for a ${size}-person team`);
    ghost += 15;
    flags.push("Too many openings for team size");
  }
  if (job.description.length < 150) {
    ghost += 10;
    flags.push("Very short description");
  }

  const score = Math.max(0, Math.min(100, 50 + reasons.reduce((s, r) => s + r.delta, 0)));
  const risk = Math.min(100, ghost);
  const eff = EFFORT[channel];
  reasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    reply: { score, reasons },
    effort: { ...eff, channel },
    ghost: { risk, flags },
    quadrant: quadrantOf(score, risk, eff.level),
    fresherFriendly: level !== "senior",
  };
}

export function quadrantOf(reply: number, ghostRisk: number, effort: "low" | "medium" | "high"): Quadrant {
  const active = reply >= ACTIVE_THRESHOLD && ghostRisk < GHOST_THRESHOLD;
  const easy = effort !== "high";
  if (active) return easy ? "apply_now" : "worth_effort";
  return easy ? "low_odds" : "skip";
}
