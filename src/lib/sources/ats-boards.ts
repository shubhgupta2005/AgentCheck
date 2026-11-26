import { isTechRole } from "../classify";
import { htmlToText, truncate } from "../text";
import type { RawJob } from "../types";
import { getJson } from "./http";

export interface BoardConfig {
  ats: "ashby" | "greenhouse" | "lever";
  slug: string;
  company: string;
}

interface AshbyJob {
  id: string;
  title: string;
  location: string;
  secondaryLocations?: { location: string }[];
  isRemote: boolean;
  isListed: boolean;
  publishedAt: string;
  jobUrl: string;
  applyUrl: string;
  descriptionPlain?: string;
  employmentType?: string;
  compensation?: { compensationTierSummary?: string };
}

async function ashby(b: BoardConfig): Promise<RawJob[]> {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${b.slug}?includeCompensation=true`,
  );
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      id: `ashby:${j.id}`,
      source: "ashby" as const,
      company: b.company,
      title: j.title.trim(),
      url: j.jobUrl,
      applyUrl: j.applyUrl,
      location: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].join(" · "),
      remote: j.isRemote,
      postedAt: j.publishedAt,
      salary: j.compensation?.compensationTierSummary || undefined,
      description: truncate(j.descriptionPlain ?? ""),
      tags: [j.employmentType ?? ""].filter(Boolean),
    }));
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  first_published?: string;
  updated_at: string;
  content?: string;
}

async function greenhouse(b: BoardConfig): Promise<RawJob[]> {
  const data = await getJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`,
  );
  return data.jobs.map((j) => ({
    id: `greenhouse:${j.id}`,
    source: "greenhouse" as const,
    company: b.company,
    title: j.title.trim(),
    url: j.absolute_url,
    // The public posting may live on the company's own domain, but the form is Greenhouse's one-pager.
    applyUrl: `https://boards.greenhouse.io/${b.slug}/jobs/${j.id}`,
    location: j.location?.name ?? "",
    remote: /remote/i.test(j.location?.name ?? ""),
    postedAt: j.first_published ?? j.updated_at,
    description: truncate(htmlToText(htmlToText(j.content ?? ""))), // content is HTML-escaped HTML
    tags: [],
  }));
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt: number;
  descriptionPlain?: string;
  workplaceType?: string;
  categories: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
}

async function lever(b: BoardConfig): Promise<RawJob[]> {
  const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${b.slug}?mode=json`);
  return data.map((j) => {
    const locs = j.categories.allLocations?.length ? j.categories.allLocations : [j.categories.location ?? ""];
    return {
      id: `lever:${j.id}`,
      source: "lever" as const,
      company: b.company,
      title: j.text.trim(),
      url: j.hostedUrl,
      applyUrl: j.applyUrl,
      location: locs.filter(Boolean).join(" · "),
      remote: j.workplaceType === "remote" || /remote/i.test(locs.join(" ")),
      postedAt: new Date(j.createdAt).toISOString(),
      description: truncate(j.descriptionPlain ?? ""),
      tags: [j.categories.team, j.categories.commitment].filter((t): t is string => !!t),
    };
  });
}

const CRAWLERS = { ashby, greenhouse, lever };

export async function crawlBoard(b: BoardConfig): Promise<RawJob[]> {
  const jobs = await CRAWLERS[b.ats](b);
  return jobs.filter((j) => isTechRole(j.title));
}
