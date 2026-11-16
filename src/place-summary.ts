import { reportPlaceSummary, reportBuild } from "../keyword-report";

type Report = ReturnType<typeof reportBuild>;

const PLACE_SUMMARY_URL =
  import.meta.env.VITE_PLACE_SUMMARY_WEBHOOK_URL?.trim() ||
  "https://n8n.srv1799142.hstgr.cloud/webhook/keyword-place-summary";

/** Writes one row per place into a "Place Summary" tab of the Sheet, through n8n. */
export async function savePlaceSummary(
  sheetId: string,
  report: Report,
): Promise<string> {
  const rows = reportPlaceSummary(report);
  const response = await fetch(PLACE_SUMMARY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetUrl: sheetId, tab: "Place Summary", rows }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `The Sheet could not be updated (HTTP ${response.status}). Check that the Sheet is editable by the automation account.`,
    );
  const result: { ok?: boolean; rows?: number; message?: string } =
    await response.json();
  if (!result.ok)
    throw new Error(result.message || "The Sheet could not be updated.");
  return `Saved ${result.rows ?? rows.length - 1} places to the "Place Summary" tab.`;
}
