# AgentCheck

**Stop applying to 600 jobs. Reach the companies that actually reply.**

Students in India send hundreds of applications a month and hear back from almost none. Most of that effort goes to big
companies that filter by ATS, to "ghost" listings that have been open for months, and to 30-minute Workday forms.

AgentCheck ranks every job by **how likely the company is to reply**, flags **ghost listings** and **scam patterns**,
and tells you **how long the application will take**, so your time goes where a human will read it.

```
                    QUICK TO APPLY             LONG FORM (Workday…)
               ┌─────────────────────────┬─────────────────────────┐
  ACTIVELY     │  Apply now              │  Worth the effort       │
  HIRING       │                         │                         │
               ├─────────────────────────┼─────────────────────────┤
  WEAK / GHOST │  Low odds               │  Skip                   │
  SIGNALS      │                         │                         │
               └─────────────────────────┴─────────────────────────┘
```

## What it looks at

Every score is a sum of explained signals. Each card shows the `+12` / `-18` lines behind its number.

| Signal | Why it matters |
| --- | --- |
| Team size (YC directory) | 20-person teams read every application; 5,000-person companies filter by keyword |
| Fresh funding (Inc42) | A company that raised in the last 90 days has budget and pressure to hire |
| Days open (posted date **and** our own first-seen date) | Jobs open 60+ days are usually not being filled. Using first-seen catches "refreshed" dates |
| Reposts | The same company + title closing and reappearing is a classic ghost-job pattern |
| "Talent pool", "future opportunities"… | Collecting resumes, not filling a seat |
| Direct posts / email applications | HN posts are written by the team; email lands in a person's inbox |
| Personal webmail recruiters | Hiring via `@gmail`/`@outlook` is a common scam pattern, so it gets flagged |
| Seniority + location | Hides senior roles and US-only "remote" jobs a student in India can't get |
| Apply channel | Ashby/Lever/Greenhouse ≈ 5 min; Workday/Taleo ≈ 30+ min with account creation |

## Sources

All public APIs/feeds, used within their terms:

- **Hacker News "Who is hiring?"** (Algolia API): monthly thread, posts written by the hiring team
- **Startup job boards** on **Ashby, Greenhouse, Lever**: add companies in [`config/boards.json`](config/boards.json)
- **Remotive** and **[Remote OK](https://remoteok.com)**: remote roles open worldwide (attributed per their API terms)
- **YC directory** ([yc-oss/api](https://github.com/yc-oss/api)): YC companies hiring in India or remote
- **Inc42 RSS**: funding announcements, parsed into company / amount / round

## Run it

```bash
npm install
npm run crawl      # fetch all sources → data/store.json (keeps history between runs)
npm run dev        # http://localhost:3000
npm test           # parser, classifier, scoring and history tests
```

> Behind a corporate/sandbox proxy, run the crawler with `NODE_USE_ENV_PROXY=1 npm run crawl` (Node ≥ 22.21).

Run the crawler daily. Ghost detection gets better the longer history accumulates, because reposts and true
"days open" can only be seen over time.

## Layout

```
config/boards.json          companies whose ATS boards we crawl
scripts/crawl.ts            crawl → merge history → print summary
src/lib/sources/            one file per source, each returns RawJob[] / Company[] / FundingEvent[]
src/lib/classify.ts         role, seniority, location, apply-channel, ghost and scam rules
src/lib/score.ts            reply-likelihood score, ghost risk, effort, quadrant
src/lib/store.ts            history: first-seen, closed, reposts
src/lib/radar.ts            joins jobs + companies + funding into the feed and company leads
src/components/RadarView.tsx the UI
supabase/migrations/        Postgres schema (jobs history, tracker, community reply rates)
```

## Roadmap

- [x] Crawlers for HN, Remotive, Remote OK, Ashby/Greenhouse/Lever, YC, Inc42
- [x] Reply-likelihood, ghost-risk, scam and effort scoring with explanations
- [x] Job history: first-seen, closed, repost detection
- [ ] Move storage to Supabase + scheduled daily crawl
- [ ] Resume upload → match % and missing skills per job (pgvector)
- [ ] Application tracker + "Did you hear back?" prompts → **real reply rates per company**
- [ ] Personalised outreach drafts for company leads
- [ ] More sources: Workday career sites, Indian startup boards
