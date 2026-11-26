const UA = "AgentCheck/0.1 (job-radar for students; +https://github.com/shubhgupta2005/AgentCheck)";

export async function getJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function getText(url: string, timeoutMs = 20_000): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}
