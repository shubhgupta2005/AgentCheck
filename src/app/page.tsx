import { RadarView, type ClientRadar } from "@/components/RadarView";
import { buildRadar } from "@/lib/radar";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const radar = buildRadar(await loadStore({ forCrawl: false }));

  // Ship only what the UI renders — descriptions are trimmed to a preview.
  const data: ClientRadar = {
    lastCrawl: radar.lastCrawl,
    sources: radar.sources,
    companies: radar.companies.slice(0, 150),
    jobs: radar.jobs.map((j) => ({
      id: j.id,
      source: j.source,
      company: j.company,
      title: j.title,
      url: j.url,
      applyUrl: j.applyUrl,
      applyEmail: j.applyEmail,
      location: j.location,
      salary: j.salary,
      preview: j.description.slice(0, 280),
      reply: j.reply,
      effort: j.effort,
      ghost: j.ghost,
      quadrant: j.quadrant,
      fresherFriendly: j.fresherFriendly,
    })),
  };

  return <RadarView data={data} />;
}
