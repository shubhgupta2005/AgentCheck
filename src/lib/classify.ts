import type { ApplyChannel } from "./types";

const TECH_ROLE =
  /\b(engineer|engineering|developer|dev|sde|swe|software|backend|back-end|frontend|front-end|full[- ]?stack|data|ml|machine learning|ai|llm|devops|sre|site reliability|android|ios|mobile|qa|sdet|test|platform|cloud|security|infra|infrastructure|programmer|data analyst|scientist|research engineer|research scientist|embedded|firmware|robotics|compiler|gpu)\b/i;

const NON_TECH =
  /\b(sales|account executive|marketing|recruiter|talent|hr\b|people partner|legal|counsel|finance|accountant|customer success|support specialist|designer|copywriter|content writer|people operations|business operations|operations (manager|associate|executive|analyst)|people partner|business development|bdr|sdr|user research|ux research|privacy|compliance|product manager|program manager|project manager|audit|risk|treasury|payroll|growth|collections?|lending)\b/i;

const ENTRY = /\b(intern|internship|trainee|graduate|new grad|fresher|entry[- ]level|apprentice|early career|campus|0[- –]2 years)\b/i;
const JUNIOR = /\b(junior|jr\.?|associate|sde[- ]?(i|1)|software engineer (i|1)|engineer (i|1))\b/i;

const SENIOR =
  /\b(senior|sr\.?|staff|principal|lead|head of|director|vp|vice president|manager|architect|(sde|swe|engineer|developer)[- ]?(ii|iii|iv|2|3|4)|10\+ years|8\+ years|7\+ years|5\+ years)\b/i;

export function isTechRole(title: string): boolean {
  return TECH_ROLE.test(title) && !NON_TECH.test(title);
}

export type Seniority = "fresher" | "mid" | "senior";

export function seniority(title: string): Seniority {
  if (ENTRY.test(title)) return "fresher";
  if (SENIOR.test(title)) return "senior";
  if (JUNIOR.test(title)) return "fresher";
  return "mid";
}

const INDIA =
  /\b(india|bengaluru|bangalore|mumbai|delhi|new delhi|ncr|gurgaon|gurugram|noida|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|kochi|indore|chandigarh|coimbatore|ist)\b/i;
const GLOBAL_REMOTE =
  /\b(worldwide|anywhere|global(ly)?|any time ?zone|all time ?zones|apac|asia|emea and apac|international)\b/i;
const RESTRICTED_REMOTE =
  /\b(us only|usa only|u\.s\. only|remote \(us\)|remote - us|remote,? us\b|us[- ]based|us citizens?|united states only|canada only|eu only|uk only|europe only|americas|latam|north america|us time ?zones?|est|pst|cet|must be located in the us|security clearance)\b/i;

export type LocationFit = "india" | "global_remote" | "restricted" | "other";

export function locationFit(location: string, remote: boolean): LocationFit {
  const loc = location || "";
  if (INDIA.test(loc)) return "india";
  if (RESTRICTED_REMOTE.test(loc)) return "restricted";
  if (GLOBAL_REMOTE.test(loc)) return "global_remote";
  if (remote && /^\s*(remote)?\s*$/i.test(loc)) return "global_remote";
  return remote ? "restricted" : "other";
}

/** Body-text phrases that lock a "remote" job to a region even when the location field doesn't say so. */
const RESTRICTED_BODY =
  /\b(us only|usa only|must be (located|based|residing) in the (us|u\.s\.|united states|eu|uk)|us citizens?(hip)? (only|required)|eligible to work in the (us|u\.s\.|united states|uk|eu)|authori[sz]ed to work in the (us|u\.s\.|united states)|green card|security clearance|north america only)\b/i;

export function regionLockedByText(text: string): boolean {
  return RESTRICTED_BODY.test(text);
}

/** Can a student in India realistically apply? */
export function indiaFriendly(location: string, remote: boolean): boolean {
  const fit = locationFit(location, remote);
  return fit === "india" || fit === "global_remote";
}

const HEAVY_ATS: [RegExp, ApplyChannel][] = [
  [/myworkdayjobs\.com|workday\.com|wd\d+\.myworkday/i, "workday"],
  [/taleo\.net|icims\.com|successfactors|sapsf\.com|oraclecloud\.com\/hcmUI|brassring|kenexa|jobvite\.com|smartrecruiters\.com|avature\.net|eightfold\.ai/i, "heavy_ats"],
];

export function detectChannel(applyUrl: string | undefined, applyEmail?: string): ApplyChannel {
  if (applyEmail) return "email";
  if (!applyUrl) return "unknown";
  if (/^mailto:/i.test(applyUrl)) return "email";
  for (const [re, ch] of HEAVY_ATS) if (re.test(applyUrl)) return ch;
  if (/ashbyhq\.com/i.test(applyUrl)) return "ashby";
  if (/greenhouse\.io/i.test(applyUrl)) return "greenhouse";
  if (/lever\.co/i.test(applyUrl)) return "lever";
  if (/remotive\.com|remoteok\.com/i.test(applyUrl)) return "job_board";
  return "careers_page";
}

export const EFFORT: Record<ApplyChannel, { level: "low" | "medium" | "high"; minutes: number; reason: string }> = {
  email: { level: "low", minutes: 5, reason: "Direct email — a short personal note reaches a human" },
  ashby: { level: "low", minutes: 5, reason: "Ashby one-page form, no account needed" },
  greenhouse: { level: "low", minutes: 7, reason: "Greenhouse one-page form, no account needed" },
  lever: { level: "low", minutes: 5, reason: "Lever one-page form, no account needed" },
  careers_page: { level: "medium", minutes: 15, reason: "Company's own careers form" },
  job_board: { level: "medium", minutes: 15, reason: "Redirects via a job board to the company's form" },
  unknown: { level: "medium", minutes: 15, reason: "Application method not stated" },
  workday: { level: "high", minutes: 35, reason: "Workday — account creation + re-typing your whole resume" },
  heavy_ats: { level: "high", minutes: 30, reason: "Enterprise ATS — long multi-page form" },
};

/** Phrases that usually mean "collecting resumes, not filling a seat". */
export const GHOST_PHRASES: RegExp[] = [
  /talent (pool|community|network|pipeline)/i,
  /future (opportunit|openings|roles)/i,
  /general application/i,
  /evergreen/i,
  /always (looking|hiring|accepting)/i,
  /don'?t see (a|the) role/i,
  /not (currently|actively) hiring/i,
  /expression of interest/i,
  /keep your (resume|cv|profile) on file/i,
];

export function ghostPhrases(text: string): string[] {
  const hits: string[] = [];
  for (const re of GHOST_PHRASES) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

/** Finds an application email in free text, ignoring obvious no-reply/privacy addresses. */
export function findEmail(text: string): string | undefined {
  const all = text.match(new RegExp(EMAIL.source, "gi")) ?? [];
  return all.find((e) => !/no-?reply|privacy|gdpr|example\.com|sentry|support@/i.test(e));
}

const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|ymail|proton|protonmail|icloud|aol|rediffmail|zoho)\.[a-z.]+$/i;

/** A company hiring through a personal webmail address is a common scam pattern targeting students. */
export function freeMailRecruiter(email: string | undefined): boolean {
  return !!email && FREE_MAIL.test(email);
}
