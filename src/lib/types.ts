export type SourceId =
  | "hn"
  | "remotive"
  | "remoteok"
  | "ashby"
  | "greenhouse"
  | "lever"
  | "yc"
  | "inc42";

/** How a candidate applies — drives the "effort" axis. */
export type ApplyChannel =
  | "email" // direct email to a person / team
  | "ashby"
  | "greenhouse"
  | "lever"
  | "workday"
  | "heavy_ats" // Taleo, iCIMS, SuccessFactors, Oracle HCM, BrassRing...
  | "job_board" // Remotive / RemoteOK listing page
  | "careers_page" // company's own page / unknown form
  | "unknown";

/** A job exactly as one crawler saw it, before history or scoring. */
export interface RawJob {
  /** Stable id: `${source}:${externalId}` */
  id: string;
  source: SourceId;
  company: string;
  title: string;
  url: string;
  applyUrl?: string;
  applyEmail?: string;
  location: string;
  remote: boolean;
  postedAt?: string; // ISO
  salary?: string;
  description: string; // plain text, truncated
  tags: string[];
  /** Posted by someone at the company directly (e.g. HN founder posts). */
  directPost?: boolean;
}

/** A job with crawl history attached (what the store keeps). */
export interface Job extends RawJob {
  companyKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Set when the job stops appearing in its source. */
  closedAt?: string;
  /** How many times the same company+title reappeared under a new id. */
  repostCount: number;
}

export interface Company {
  key: string;
  name: string;
  website?: string;
  teamSize?: number;
  location?: string;
  stage?: string;
  ycBatch?: string;
  ycUrl?: string;
  isHiring?: boolean;
  oneLiner?: string;
  sources: SourceId[];
}

export interface FundingEvent {
  id: string;
  company: string;
  companyKey: string;
  headline: string;
  amountText?: string;
  amountUsd?: number;
  round?: string;
  date: string; // ISO
  url: string;
  source: SourceId;
}

export interface Reason {
  text: string;
  delta: number;
}

export type Quadrant = "apply_now" | "worth_effort" | "low_odds" | "skip";

export interface Scored {
  reply: { score: number; reasons: Reason[] };
  effort: { level: "low" | "medium" | "high"; minutes: number; channel: ApplyChannel; reason: string };
  ghost: { risk: number; flags: string[] };
  quadrant: Quadrant;
  fresherFriendly: boolean;
}

export type ScoredJob = Job & Scored & { funding?: FundingEvent; companyInfo?: Company };

export interface CrawlRun {
  at: string;
  counts: Partial<Record<SourceId, number>>;
  errors: string[];
}

export interface StoreData {
  version: 1;
  jobs: Record<string, Job>;
  /** `${companyKey}|${normalizedTitle}` -> job ids seen over time (repost detection). */
  titleHistory: Record<string, string[]>;
  companies: Record<string, Company>;
  funding: Record<string, FundingEvent>;
  runs: CrawlRun[];
}
