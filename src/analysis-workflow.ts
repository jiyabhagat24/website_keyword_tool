export interface AnalysisResponse {
  sources: { name: string; text: string }[];
  brands: string[];
  detected: boolean;
  keywordCount: number;
}

export async function runAnalysisWorkflow(
  sheetId: string,
  accessKey: string,
  detectBrands: boolean,
): Promise<AnalysisResponse> {
  const endpoint = import.meta.env.VITE_ANALYSIS_WEBHOOK_URL?.trim();
  if (!endpoint)
    throw new Error(
      "The analysis workflow URL is not configured. Set VITE_ANALYSIS_WEBHOOK_URL when building the website.",
    );
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("The configured analysis workflow URL is invalid.");
  }
  if (url.protocol !== "https:")
    throw new Error("The analysis workflow URL must use HTTPS.");
  if (!accessKey.trim())
    throw new Error("Enter the analysis access key configured in n8n.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Report-Key": accessKey.trim(),
      },
      body: JSON.stringify({ sheetId, detectBrands }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "The analysis access key was rejected. Check the n8n webhook credential.",
      );
    if (!response.ok)
      throw new Error(
        `The analysis workflow returned HTTP ${response.status}. Check its execution in n8n.`,
      );
    const data: unknown = await response.json();
    if (!data || typeof data !== "object")
      throw new Error("The analysis workflow returned an invalid response.");
    const result = data as AnalysisResponse;
    if (
      !Array.isArray(result.sources) ||
      !result.sources.every(
        (source) =>
          typeof source.name === "string" && typeof source.text === "string",
      ) ||
      !Array.isArray(result.brands) ||
      !result.brands.every((brand) => typeof brand === "string") ||
      typeof result.detected !== "boolean"
    ) {
      throw new Error("The analysis workflow returned an invalid response.");
    }
    if (detectBrands && !result.detected && result.keywordCount !== 0)
      throw new Error("The workflow did not complete brand detection.");
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(
        "The analysis timed out. Check its execution in n8n before retrying.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
