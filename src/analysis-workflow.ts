import { ANALYSIS_WEBHOOK_URL } from "./config";
export interface StrategicRead {
  items: { section: string; observation: string; hypothesis: string }[];
  caveats: string[];
  model: string;
}

export const websiteIntents = [
  "Price / Buy",
  "Best / Review",
  "Comparison",
  "Question",
  "How-to",
  "Concern",
  "Ingredient",
  "Local",
  "Recipe",
];

export type WebsiteKeywordLabel = {
  brandType:
    "Own brand" | "Branded" | "Competitor brand" | "Generic" | "Unclassified";
  brandName: string;
  intent: string;
};

export async function classifyWebsiteKeywords(
  hosts: string[],
  keywords: string[],
  sovCategory = "",
) {
  const endpoint =
    import.meta.env.VITE_ANALYSIS_WEBHOOK_URL?.trim() || ANALYSIS_WEBHOOK_URL;
  if (!endpoint || new URL(endpoint).protocol !== "https:")
    throw new Error("The AI analysis needs an HTTPS webhook URL.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "classify_website",
      hosts,
      keywords,
      ...(sovCategory && { sovCategory }),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok)
    throw new Error(
      `The AI classifier returned HTTP ${response.status}. Check the analysis workflow in n8n.`,
    );
  const result: { labels?: unknown[] } = await response.json();
  if (!Array.isArray(result?.labels))
    throw new Error(
      "The analysis webhook needs the updated website classification workflow.",
    );
  const labels = new Map<string, WebsiteKeywordLabel>();
  for (const raw of result.labels) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<WebsiteKeywordLabel> & { id?: number };
    if (
      typeof row.id !== "number" ||
      !Number.isInteger(row.id) ||
      !keywords[row.id]
    )
      continue;
    if (
      row.brandType !== "Own brand" &&
      row.brandType !== "Branded" &&
      row.brandType !== "Competitor brand" &&
      row.brandType !== "Generic" &&
      row.brandType !== "Unclassified"
    )
      continue;
    const named =
      row.brandType === "Own brand" ||
      row.brandType === "Branded" ||
      row.brandType === "Competitor brand";
    const brandName =
      named && typeof row.brandName === "string"
        ? row.brandName.trim().slice(0, 100)
        : "";
    labels.set(keywords[row.id], {
      brandType: named && !brandName ? "Unclassified" : row.brandType,
      brandName,
      intent:
        typeof row.intent === "string" && websiteIntents.includes(row.intent)
          ? row.intent
          : "",
    });
  }
  if (!labels.size) throw new Error("The AI returned no valid keyword labels.");
  return labels;
}

/** Sends calculated facts and selected keyword examples for AI hypotheses. */
export async function requestStrategicRead(
  facts: unknown,
): Promise<StrategicRead> {
  const endpoint =
    import.meta.env.VITE_ANALYSIS_WEBHOOK_URL?.trim() || ANALYSIS_WEBHOOK_URL;
  if (!endpoint)
    throw new Error(
      "The analysis workflow URL is not configured. Set VITE_ANALYSIS_WEBHOOK_URL when building the website.",
    );
  const url = new URL(endpoint);
  if (url.protocol !== "https:")
    throw new Error("The analysis workflow URL must use HTTPS.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "narrative", facts }),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `The strategic read returned HTTP ${response.status}. Check its execution in n8n.`,
      );
    const data = (await response.json()) as StrategicRead;
    if (
      !data ||
      !Array.isArray(data.items) ||
      !Array.isArray(data.caveats) ||
      !data.items.every(
        (item) =>
          typeof item.section === "string" &&
          typeof item.observation === "string" &&
          typeof item.hypothesis === "string",
      )
    )
      throw new Error("The strategic read returned an invalid response.");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("The strategic read timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
