import { describe, expect, it } from "vitest";
import { parseFundingHeadline } from "../sources/funding";
import { parseHnComment } from "../sources/hn";
import { companyKey } from "../text";

describe("parseFundingHeadline", () => {
  it("parses USD rounds", () => {
    const p = parseFundingHeadline("Green Aero Raises $14 Mn To Build Jet Engines, Combat Drones");
    expect(p).toMatchObject({ company: "Green Aero", amountText: "$14 Mn", amountUsd: 14_000_000 });
  });
  it("converts crore to USD", () => {
    const p = parseFundingHeadline("Finnable Nets ₹405 Cr To Scale Digital Lending Business");
    expect(p?.company).toBe("Finnable");
    expect(p?.amountUsd).toBeGreaterThan(40_000_000);
    expect(p?.amountUsd).toBeLessThan(50_000_000);
  });
  it("strips descriptors and possessives", () => {
    expect(parseFundingHeadline("Former Flipkart Exec Anil Goteti’s Scapia Raises $9 Mn In Seed Funding")).toMatchObject({
      company: "Scapia",
      round: "Seed",
    });
    expect(parseFundingHeadline("Agritech Startup Absolute Raises $100 Mn To Help Farmers")?.company).toBe("Absolute");
    expect(parseFundingHeadline("[Update] Exclusive: Increff Bags $12 Mn Led By Premji Invest")?.company).toBe("Increff");
  });
  it("ignores non-round news", () => {
    expect(parseFundingHeadline("Urban Company Forays Into AC Market, Opens Pre-Bookings At ₹55,499")).toBeNull();
    expect(parseFundingHeadline("Epiq Capital Marks Final Close Of Its $225 Mn Fund II")).toBeNull();
    expect(parseFundingHeadline("Dry Spell Continues: Indian Startup Funding Falls To $5.4 Bn In H1")).toBeNull();
  });
});

describe("parseHnComment", () => {
  const base = { id: 1, author: "founder", created_at: "2026-11-02T16:00:00Z" };

  it("parses a standard pipe header", () => {
    const j = parseHnComment({
      ...base,
      text: 'Acme | Backend Engineer | REMOTE (Worldwide) | $60k-$90k | <a href="https:&#x2F;&#x2F;acme.dev&#x2F;jobs">https://acme.dev/jobs</a><p>We build things. Email jobs@acme.dev',
    });
    expect(j).toMatchObject({
      company: "Acme",
      title: "Backend Engineer",
      location: "REMOTE (Worldwide)",
      remote: true,
      applyUrl: "https://acme.dev/jobs",
      applyEmail: "jobs@acme.dev",
      directPost: true,
    });
  });

  it("splits location out of a combined role segment", () => {
    const j = parseHnComment({
      ...base,
      text: "ChainSecurity | Blockchain Security Engineer, HYBRID/REMOTE, Zurich, Switzerland<p>Details",
    });
    expect(j?.title).toBe("Blockchain Security Engineer");
    expect(j?.location).toContain("Zurich");
  });

  it("cuts a header that runs into prose", () => {
    const j = parseHnComment({ ...base, text: "Tether | Product Engineer, Keet | REMOTE (Worldwide) We're looking for a builder" });
    expect(j?.location).toBe("REMOTE (Worldwide)");
  });

  it("skips non-job comments and non-tech roles", () => {
    expect(parseHnComment({ ...base, text: "Is this role open to people in Canada?" })).toBeNull();
    expect(parseHnComment({ ...base, text: "Acme | Account Executive | NYC" })).toBeNull();
  });
});

describe("companyKey", () => {
  it("joins the same company across sources", () => {
    expect(companyKey("Bolna AI")).toBe(companyKey("Bolna"));
    expect(companyKey("Sarvam AI")).toBe(companyKey("Sarvam"));
    expect(companyKey("Fluence International, Inc.")).toBe(companyKey("Fluence International"));
  });
});
