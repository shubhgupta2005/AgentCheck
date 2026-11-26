import { XMLParser } from "fast-xml-parser";
import { companyKey, decodeEntities } from "../text";
import type { FundingEvent } from "../types";
import { getText } from "./http";

/** Rough INR→USD for ranking only; we always show the original amount text. */
const INR_PER_USD = 88;

const VERB = /\b(raises|raised|bags|secures|lands|nets|mops up|grabs|closes|picks up|gets)\b/i;
const AMOUNT =
  /(\$|usd|₹|inr|rs\.?)\s?([\d,.]+)\s?(mn|million|bn|billion|cr|crore|lakh|k)\b|([\d,.]+)\s?(mn|million|bn|billion|cr|crore)\b/i;
const ROUND = /\b(pre-seed|seed|pre-series [a-e]|series [a-h]|bridge|angel|debt|growth)\b/i;
const NOT_A_STARTUP_ROUND = /\bfund\b(?! from| led)|fund ii|fund i\b|corpus|final close|funding (falls|plunges|drops|rises|jumps)|startups? raised|ipo/i;
const DESCRIPTOR =
  /^.*\b(startup|platform|company|brand|maker|provider|unicorn|player|firm|marketplace|app|aggregator)\s+/i;

export interface ParsedFunding {
  company: string;
  amountText?: string;
  amountUsd?: number;
  round?: string;
}

/** Extracts "<Company> Raises <amount>" from a headline. Returns null for non-funding news. */
export function parseFundingHeadline(raw: string): ParsedFunding | null {
  const headline = decodeEntities(raw).replace(/^\s*(\[[^\]]+\]\s*)?(exclusive|breaking)\s*:\s*/i, "").trim();
  const verb = headline.match(VERB);
  if (!verb || verb.index === undefined) return null;
  if (NOT_A_STARTUP_ROUND.test(headline)) return null;
  const after = headline.slice(verb.index);
  const amt = after.match(AMOUNT);
  const hasFundingWord = /funding|round|seed|series|investment|capital|led by/i.test(after);
  if (!amt && !hasFundingWord) return null;

  let company = headline.slice(0, verb.index).trim();
  const poss = company.split(/[’']s\s+/);
  if (poss.length > 1) company = poss[poss.length - 1];
  company = company.replace(DESCRIPTOR, "").replace(/[-–:,]+$/, "").trim();
  if (!company || company.split(/\s+/).length > 5) return null;

  let amountText: string | undefined;
  let amountUsd: number | undefined;
  if (amt) {
    amountText = amt[0].trim();
    const cur = (amt[1] ?? "").toLowerCase();
    const num = parseFloat((amt[2] ?? amt[4]).replace(/,/g, ""));
    const unit = (amt[3] ?? amt[5]).toLowerCase();
    const mult =
      unit.startsWith("bn") || unit.startsWith("billion")
        ? 1e9
        : unit.startsWith("mn") || unit.startsWith("million")
          ? 1e6
          : unit.startsWith("cr")
            ? 1e7
            : unit === "lakh"
              ? 1e5
              : 1e3;
    const isInr = cur.includes("₹") || cur.includes("inr") || cur.startsWith("rs") || unit.startsWith("cr") || unit === "lakh";
    amountUsd = Math.round((num * mult) / (isInr ? INR_PER_USD : 1));
  }
  const round = headline.match(ROUND)?.[0];
  return { company, amountText, amountUsd, round: round ? round.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined };
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  guid?: string | { "#text": string };
}

const FEEDS = ["https://inc42.com/feed/", "https://inc42.com/buzz/feed/"];

export async function crawlFunding(): Promise<FundingEvent[]> {
  const parser = new XMLParser({ ignoreAttributes: true });
  const events = new Map<string, FundingEvent>();
  for (const feed of FEEDS) {
    const xml = await getText(feed);
    const doc = parser.parse(xml);
    const items: RssItem[] = [doc?.rss?.channel?.item ?? []].flat();
    for (const it of items) {
      const p = parseFundingHeadline(String(it.title));
      if (!p) continue;
      const id = `inc42:${it.link}`;
      events.set(id, {
        id,
        company: p.company,
        companyKey: companyKey(p.company),
        headline: decodeEntities(String(it.title)),
        amountText: p.amountText,
        amountUsd: p.amountUsd,
        round: p.round,
        date: new Date(it.pubDate).toISOString(),
        url: it.link,
        source: "inc42",
      });
    }
  }
  return [...events.values()];
}
