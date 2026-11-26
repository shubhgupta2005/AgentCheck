import { describe, expect, it } from "vitest";
import { detectChannel, ghostPhrases, indiaFriendly, isTechRole, locationFit, regionLockedByText, seniority } from "../classify";

describe("isTechRole", () => {
  it.each([
    ["Backend Engineering Intern", true],
    ["Software Development Engineer 3, Samvaad", true],
    ["DevOps Engineer", true],
    ["People Operations Intern", false],
    ["Sr. Associate - Data Privacy", false],
    ["Area Collection Manager - Lending Collections (Frontend)", false],
    ["Account Executive", false],
  ])("%s -> %s", (title, expected) => expect(isTechRole(title)).toBe(expected));
});

describe("seniority", () => {
  it.each([
    ["Backend Engineering Intern", "fresher"],
    ["Software Engineer I", "fresher"],
    ["Associate Software Engineer", "fresher"],
    ["Software Development Engineer 3", "senior"],
    ["SDE II", "senior"],
    ["Sr. Associate - Data", "senior"],
    ["Staff Engineer, API Platform", "senior"],
    ["Software Engineer", "mid"],
  ])("%s -> %s", (title, expected) => expect(seniority(title)).toBe(expected));
});

describe("location", () => {
  it("treats Indian cities as India", () => expect(locationFit("Bengaluru, KA", false)).toBe("india"));
  it("treats worldwide remote as global", () => expect(locationFit("REMOTE (Worldwide)", true)).toBe("global_remote"));
  it("treats bare Remote as global", () => expect(locationFit("Remote", true)).toBe("global_remote"));
  it("rejects US-only remote", () => expect(indiaFriendly("Remote (US)", true)).toBe(false));
  it("rejects onsite abroad", () => expect(indiaFriendly("San Francisco, CA", false)).toBe(false));
  it("India wins over a US mention", () => expect(locationFit("Remote (US, India)", true)).toBe("india"));
  it("spots region locks in body text", () =>
    expect(regionLockedByText("You must be authorized to work in the United States.")).toBe(true));
});

describe("detectChannel", () => {
  it.each([
    ["https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123", undefined, "workday"],
    ["https://jobs.ashbyhq.com/acme/1/application", undefined, "ashby"],
    ["https://boards.greenhouse.io/acme/jobs/1", undefined, "greenhouse"],
    ["https://jobs.lever.co/acme/1/apply", undefined, "lever"],
    ["https://acme.taleo.net/careersection/1", undefined, "heavy_ats"],
    ["https://acme.com/careers", "jobs@acme.com", "email"],
    ["https://acme.com/careers", undefined, "careers_page"],
  ])("%s", (url, email, expected) => expect(detectChannel(url, email)).toBe(expected));
});

describe("ghostPhrases", () => {
  it("flags talent-pool language", () =>
    expect(ghostPhrases("Join our talent community for future opportunities")).toHaveLength(2));
  it("ignores normal descriptions", () => expect(ghostPhrases("Build APIs in Go with a small team")).toEqual([]));
});
