import { ANALYSIS_WEBHOOK_URL } from "./config";
export interface StrategicRead {
  items: { section: string; observation: string; hypothesis: string }[];
  caveats: string[];
  model: string;
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
