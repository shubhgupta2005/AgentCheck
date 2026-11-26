import { indiaFriendly, locationFit, regionLockedByText } from "./classify";
import { scoreJob } from "./score";
import { openJobs } from "./store";
import { daysBetween } from "./text";
import type { Company, FundingEvent, ScoredJob, StoreData } from "./types";

export interface CompanyLead {
  key: string;
  name: string;
  why: string[];
  priority: number;
  company?: Company;
  funding?: FundingEvent;
  openRoles: number;
  links: { label: string; url: string }[];
}

export interface Radar {
  jobs: ScoredJob[];
  companies: CompanyLead[];
  lastCrawl?: string;
  sources: Record<string, number>;
}

function latestFundingByCompany(store: StoreData): Map<string, FundingEvent> {
  const m = new Map<string, FundingEvent>();
  for (const f of Object.values(store.funding)) {
    const cur = m.get(f.companyKey);
    if (!cur || f.date > cur.date) m.set(f.companyKey, f);
  }
  return m;
}

export function buildRadar(store: StoreData, now = new Date()): Radar {
  const funding = latestFundingByCompany(store);
  const open = openJobs(store).filter(
    (j) =>
      indiaFriendly(j.location, j.remote) &&
      // A remote job open worldwide can still be US-only in the small print.
      !(locationFit(j.location, j.remote) === "global_remote" && regionLockedByText(j.description)),
  );

  const rolesByCompany = new Map<string, number>();
  for (const j of open) rolesByCompany.set(j.companyKey, (rolesByCompany.get(j.companyKey) ?? 0) + 1);

  const jobs: ScoredJob[] = open
    .map((j) => {
      const company = store.companies[j.companyKey];
      const f = funding.get(j.companyKey);
      const s = scoreJob(j, { company, funding: f, openRoles: rolesByCompany.get(j.companyKey) ?? 1, now });
      return { ...j, ...s, funding: f, companyInfo: company };
    })
    .sort((a, b) => b.reply.score - a.reply.score);

  // ── Company leads: recently funded or YC-hiring companies worth reaching out to directly ──
  const leads = new Map<string, CompanyLead>();
  const lead = (key: string, name: string): CompanyLead => {
    let l = leads.get(key);
    if (!l) {
      l = { key, name, why: [], priority: 0, openRoles: rolesByCompany.get(key) ?? 0, links: [] };
      leads.set(key, l);
    }
    return l;
  };

  for (const f of funding.values()) {
    const d = daysBetween(f.date, now) ?? 999;
    if (d > 180) continue;
    const l = lead(f.companyKey, f.company);
    l.funding = f;
    l.priority += d <= 30 ? 40 : d <= 90 ? 30 : 15;
    l.why.push(`${f.amountText ? `Raised ${f.amountText}` : "Raised funding"}${f.round ? ` (${f.round})` : ""} ${d === 0 ? "today" : `${d}d ago`}`);
    l.links.push({ label: "Funding news", url: f.url });
  }

  for (const c of Object.values(store.companies)) {
    if (!c.isHiring) continue;
    const l = lead(c.key, c.name);
    l.company = c;
    if (c.teamSize !== undefined && c.teamSize <= 60) l.priority += 20;
    else if (c.teamSize !== undefined && c.teamSize <= 200) l.priority += 12;
    else if (c.teamSize !== undefined && c.teamSize > 1000) l.priority -= 15;
    l.why.push(
      `YC ${c.ycBatch ?? ""} · hiring now${c.teamSize ? ` · ${c.teamSize} people` : ""}${c.location ? ` · ${c.location}` : ""}`.replace(/\s+·/g, " ·"),
    );
    if (c.ycUrl) l.links.push({ label: "Open roles (YC)", url: `${c.ycUrl}/jobs` });
    if (c.website) l.links.push({ label: "Website", url: c.website });
  }

  for (const l of leads.values()) {
    if (l.openRoles > 0) {
      l.priority += 10;
      l.why.push(`${l.openRoles} open tech role${l.openRoles > 1 ? "s" : ""} in your feed`);
    }
  }

  const companies = [...leads.values()].sort((a, b) => b.priority - a.priority);

  const sources: Record<string, number> = {};
  for (const j of jobs) sources[j.source] = (sources[j.source] ?? 0) + 1;

  return { jobs, companies, lastCrawl: store.runs[0]?.at, sources };
}
