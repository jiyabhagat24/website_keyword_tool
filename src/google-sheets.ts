import { LOCATIONS } from "./config";

const publicApiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY?.trim();
const locations = new Set(LOCATIONS.map((name) => name.toLowerCase()));
const inputTabs = new Set(["keyword input", "website input"]);

export function sheetIdFromInput(value: string): string | null {
  const text = value.trim();
  const match = text.match(
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:[/?#]|$)/,
  );
  return match?.[1] ?? (/^[\w-]{16,}$/.test(text) ? text : null);
}

function isLocationTab(title: string): boolean {
  return locations.has(title.trim().toLowerCase());
}

function isReportTab(title: string): boolean {
  return isLocationTab(title) || inputTabs.has(title.trim().toLowerCase());
}

function csvSource(title: string, rows: unknown[][]) {
  const text = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\r\n");
  return { name: `${title}.csv`, text };
}

async function readPublicWorkbook(sheetId: string) {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`;
  const accessMessage =
    "Google could not download this Sheet. Check the link and set General access to Anyone with the link (Viewer), or import CSV files.";
  let workbook: Blob;
  try {
    const response = await fetch(url, {
      credentials: "omit",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(accessMessage);
    workbook = await response.blob();
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error(
        "Google took too long to download this Sheet. Try again.",
      );
    throw new Error(accessMessage);
  }
  if (workbook.type.startsWith("text/html")) throw new Error(accessMessage);

  const { default: readWorkbook } = await import("read-excel-file/browser");
  const tabs = await readWorkbook(workbook).catch(() => {
    throw new Error(
      "Google's workbook export could not be read. Try importing CSV files.",
    );
  });
  if (!tabs.some(({ sheet }) => isLocationTab(sheet)))
    throw new Error("No recognized location tabs were found in this Sheet.");
  return tabs
    .filter(({ sheet }) => isReportTab(sheet))
    .map(({ sheet, data }) => csvSource(sheet, data));
}

export async function readGoogleSheet(
  sheetId: string,
): Promise<{ name: string; text: string }[]> {
  if (!publicApiKey) return readPublicWorkbook(sheetId);

  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const signal = AbortSignal.timeout(120_000);
  async function get<T>(path: string, params: URLSearchParams): Promise<T> {
    params.set("key", publicApiKey!);
    const response = await fetch(`${base}${path}?${params}`, {
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Google could not read this Sheet. Set General access to Anyone with the link (Viewer), or import CSV files.",
      );
    }
    if (!response.ok)
      throw new Error(
        `Google Sheets returned HTTP ${response.status}. Check the Sheet link and try again.`,
      );
    return response.json();
  }

  const metadata = await get<{
    sheets?: { properties?: { title?: string } }[];
  }>("", new URLSearchParams({ fields: "sheets(properties(title))" }));
  const titles = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => Boolean(title && isReportTab(title)));
  if (!titles.some(isLocationTab))
    throw new Error("No recognized location tabs were found in this Sheet.");

  const sources: { name: string; text: string }[] = [];
  for (let offset = 0; offset < titles.length; offset += 4) {
    const batch = titles.slice(offset, offset + 4);
    const params = new URLSearchParams({
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    for (const title of batch)
      params.append("ranges", `'${title.replaceAll("'", "''")}'`);
    const data = await get<{ valueRanges?: { values?: unknown[][] }[] }>(
      "/values:batchGet",
      params,
    );
    if (data.valueRanges?.length !== batch.length)
      throw new Error("Google Sheets did not return every requested tab.");
    for (const [index, range] of data.valueRanges.entries())
      sources.push(csvSource(batch[index], range.values ?? []));
  }
  return sources;
}
