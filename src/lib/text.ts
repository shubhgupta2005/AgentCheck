const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  rupee: "₹",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** HTML -> readable plain text (keeps paragraph breaks). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function truncate(s: string, n = 1200): string {
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

const COMPANY_SUFFIX =
  /\b(inc|llc|ltd|limited|pvt|private|technologies|technology|labs|software|solutions|corp|corporation|co|hq|ai|io)\b\.?/g;

/** Normalised key used to join the same company across sources. */
export function companyKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[’']s\b/g, "")
    .replace(/&/g, " and ");
  const stripped = base.replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]+/g, "");
  return stripped || base.replace(/[^a-z0-9]+/g, "");
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function daysBetween(fromIso: string | undefined, now: Date): number | undefined {
  if (!fromIso) return undefined;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}
