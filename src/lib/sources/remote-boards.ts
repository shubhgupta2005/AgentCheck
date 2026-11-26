import { isTechRole } from "../classify";
import { htmlToText, truncate } from "../text";
import type { RawJob } from "../types";
import { getJson } from "./http";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

const REMOTIVE_CATEGORIES = ["software-dev", "data", "devops"];

export async function crawlRemotive(): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const cat of REMOTIVE_CATEGORIES) {
    const data = await getJson<{ jobs: RemotiveJob[] }>(`https://remotive.com/api/remote-jobs?category=${cat}`);
    for (const j of data.jobs) {
      if (!isTechRole(j.title)) continue;
      out.push({
        id: `remotive:${j.id}`,
        source: "remotive",
        company: j.company_name.trim(),
        title: j.title.trim(),
        url: j.url,
        applyUrl: j.url,
        location: j.candidate_required_location || "Remote",
        remote: true,
        postedAt: new Date(j.publication_date + (j.publication_date.endsWith("Z") ? "" : "Z")).toISOString(),
        salary: j.salary || undefined,
        description: truncate(htmlToText(j.description)),
        tags: j.tags ?? [],
      });
    }
  }
  return dedupe(out);
}

interface RemoteOkJob {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
}

/** Remote OK API terms require attribution + a followed link back — the UI shows "via Remote OK". */
export async function crawlRemoteOk(): Promise<RawJob[]> {
  const data = await getJson<RemoteOkJob[]>("https://remoteok.com/api");
  const out: RawJob[] = [];
  for (const j of data) {
    if (!j.id || !j.position || !j.company) continue; // first element is the legal notice
    if (!isTechRole(j.position)) continue;
    const salary =
      j.salary_min && j.salary_max ? `$${Math.round(j.salary_min / 1000)}K–$${Math.round(j.salary_max / 1000)}K` : undefined;
    out.push({
      id: `remoteok:${j.id}`,
      source: "remoteok",
      company: j.company.trim(),
      title: j.position.trim(),
      url: j.url ?? `https://remoteok.com/remote-jobs/${j.slug}`,
      applyUrl: j.url ?? `https://remoteok.com/remote-jobs/${j.slug}`,
      location: j.location?.trim() || "Remote",
      remote: true,
      postedAt: j.date ? new Date(j.date).toISOString() : undefined,
      salary,
      description: truncate(htmlToText(j.description ?? "")),
      tags: j.tags ?? [],
    });
  }
  return out;
}

function dedupe(jobs: RawJob[]): RawJob[] {
  const seen = new Map<string, RawJob>();
  for (const j of jobs) seen.set(j.id, j);
  return [...seen.values()];
}
