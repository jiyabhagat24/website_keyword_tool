/** Saves finished AI work in this browser, so the same data is never paid for twice. */
const READS = "tbm-ai-reads-v1";
const LABELS = "tbm-ai-labels-v1";
const MAX_READS = 60;
const MAX_LABELS = 20000;

function load<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the page still works, it just cannot remember.
  }
}

export async function hashOf(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getSavedRead<T>(facts: unknown): Promise<T | null> {
  const entry = load<{ at: string; read: T }>(READS)[await hashOf(facts)];
  return entry ? { ...entry.read, cachedAt: entry.at } : null;
}

export async function saveRead(facts: unknown, read: unknown) {
  const all = load<{ at: string; read: unknown }>(READS);
  all[await hashOf(facts)] = { at: new Date().toISOString(), read };
  const keep = Object.entries(all)
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, MAX_READS);
  save(READS, Object.fromEntries(keep));
}

const labelKey = (scope: string, keyword: string) => scope + "\u0001" + keyword;

export function getSavedLabels<T>(scope: string, keywords: string[]) {
  const all = load<T>(LABELS);
  const found = new Map<string, T>();
  for (const keyword of keywords) {
    const hit = all[labelKey(scope, keyword)];
    if (hit) found.set(keyword, hit);
  }
  return found;
}

export function saveLabels<T>(scope: string, labels: Map<string, T>) {
  const all = load<T>(LABELS);
  for (const [keyword, label] of labels) all[labelKey(scope, keyword)] = label;
  const keys = Object.keys(all);
  if (keys.length > MAX_LABELS)
    for (const key of keys.slice(0, keys.length - MAX_LABELS)) delete all[key];
  save(LABELS, all);
}
