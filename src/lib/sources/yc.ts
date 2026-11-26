import { indiaFriendly } from "../classify";
import { companyKey } from "../text";
import type { Company } from "../types";
import { getJson } from "./http";

interface YcCompany {
  name: string;
  slug: string;
  website: string;
  all_locations: string;
  one_liner: string;
  team_size: number | null;
  isHiring: boolean;
  batch: string;
  status: string;
  stage: string;
  regions: string[];
  url: string;
}

/**
 * YC companies currently hiring whose team is in India or who hire remotely.
 * Data: community mirror of the YC directory (github.com/yc-oss/api), refreshed daily.
 */
export async function crawlYc(): Promise<Company[]> {
  const data = await getJson<YcCompany[]>("https://yc-oss.github.io/api/companies/hiring.json", 60_000);
  return data
    .filter((c) => c.isHiring && c.status !== "Inactive" && c.status !== "Acquired")
    .filter((c) => {
      const regions = c.regions.join(" ");
      const remote = /\bRemote\b/.test(regions) && !/Partly Remote/.test(regions);
      return indiaFriendly(`${c.all_locations} ${/India/.test(regions) ? "India" : ""}`, remote) || /India/.test(regions);
    })
    .map((c) => ({
      key: companyKey(c.name),
      name: c.name,
      website: c.website || undefined,
      teamSize: c.team_size ?? undefined,
      location: c.all_locations || undefined,
      stage: c.stage,
      ycBatch: c.batch,
      ycUrl: c.url,
      isHiring: true,
      oneLiner: c.one_liner,
      sources: ["yc"],
    }));
}
