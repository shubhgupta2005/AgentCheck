import { findEmail, isTechRole } from "../classify";
import { htmlToText, truncate } from "../text";
import type { RawJob } from "../types";
import { getJson } from "./http";

interface HnItem {
  id: number;
  author: string | null;
  created_at: string;
  text: string | null;
  title?: string;
  children: HnItem[];
}

interface HnSearch {
  hits: { objectID: string; title: string; created_at: string }[];
}

/** Finds the latest "Ask HN: Who is hiring?" thread posted by the whoishiring bot. */
export async function latestWhoIsHiringId(): Promise<string> {
  const data = await getJson<HnSearch>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10",
  );
  const hit = data.hits.find((h) => /who is hiring/i.test(h.title));
  if (!hit) throw new Error("No 'Who is hiring?' thread found");
  return hit.objectID;
}

const ROLE_HINT = /engineer|developer|sde|swe|intern|scientist|full.?stack|backend|frontend|devops|ml|ai\b|data/i;
const LOCATION_HINT = /remote|onsite|on-site|hybrid|india|bangalore|bengaluru|anywhere|worldwide|[A-Z][a-z]+,\s?[A-Z]{2}\b/i;

/**
 * Parses one top-level HN hiring comment. Convention is a pipe-separated header line:
 *   Company | Role(s) | Location | REMOTE | Salary | URL
 * Returns null for comments that aren't job posts.
 */
export function parseHnComment(item: Pick<HnItem, "id" | "author" | "created_at" | "text">): RawJob | null {
  if (!item.text || !item.author) return null;
  const html = item.text;
  const firstHtml = html.split(/<p>/i)[0];
  const header = htmlToText(firstHtml).replace(/\s+/g, " ").trim();
  const parts = header.split(/\s+\|\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const company = parts[0].replace(/\(.*?\)/g, "").trim();
  if (!company || company.length > 60) return null;

  // Headers sometimes run straight into the body ("…| REMOTE We're looking for…"): cut each part at prose.
  const rest = parts
    .slice(1)
    .map((p) => p.split(/\s(?=(?:We|We're|We’re|Our|I'm|I’m|Hi|Join|Looking|About)\b)/)[0].trim())
    .filter(Boolean);
  const roles: string[] = [];
  const locs: string[] = [];
  for (const p of rest) {
    if (/^https?:/i.test(p)) continue;
    // "Security Engineer, HYBRID/REMOTE, Zurich" -> role "Security Engineer", location "HYBRID/REMOTE, Zurich"
    const cut = p.search(/[,(/]?\s*\b(remote|hybrid|onsite|on-site|in-office|in office)\b/i);
    const rolePart = cut > 0 ? p.slice(0, cut).replace(/[\s,/(]+$/, "") : cut === 0 ? "" : p;
    const locPart = cut >= 0 ? p.slice(cut).replace(/^[\s,/]+/, "") : "";
    if (rolePart && ROLE_HINT.test(rolePart)) roles.push(rolePart);
    else if (rolePart && LOCATION_HINT.test(rolePart)) locs.push(rolePart);
    if (locPart) locs.push(locPart);
  }
  const salary = rest.find((p) => /[$€£₹]\s?\d|\d+k\b|lpa|ctc/i.test(p));
  const fullText = htmlToText(html);
  // No role in the header: only keep it if the post itself is about engineering hiring.
  if (!roles.length && !/\b(engineers?|developers?|engineering)\b/i.test(fullText.slice(0, 800))) return null;
  let title = roles.join(" / ") || "Engineering roles";
  if (title.length > 100) title = title.slice(0, 100).replace(/\s+\S*$/, "") + "…";
  if (!isTechRole(title)) return null;

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => htmlToText(m[1]));
  const applyUrl = hrefs.find((h) => /^https?:/i.test(h) && !/news\.ycombinator\.com/i.test(h));
  const applyEmail = findEmail(fullText);
  const location = locs.join(" · ") || (/\bremote\b/i.test(header) ? "Remote" : "");

  return {
    id: `hn:${item.id}`,
    source: "hn",
    company,
    title,
    url: `https://news.ycombinator.com/item?id=${item.id}`,
    applyUrl,
    applyEmail,
    location,
    remote: /\bremote\b/i.test(header),
    postedAt: item.created_at,
    salary,
    description: truncate(fullText),
    tags: ["hn-who-is-hiring"],
    // HN hiring posts are written by someone at the company (often a founder/engineer), not an agency.
    directPost: true,
  };
}

export async function crawlHn(): Promise<RawJob[]> {
  const id = await latestWhoIsHiringId();
  const thread = await getJson<HnItem>(`https://hn.algolia.com/api/v1/items/${id}`, 60_000);
  return thread.children.map(parseHnComment).filter((j): j is RawJob => j !== null);
}
