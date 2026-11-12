import { LOCATIONS } from "./config";

const sheetsReadScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
const sheetsWriteScope = "https://www.googleapis.com/auth/spreadsheets";
const publicApiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY?.trim();
const oauthClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const locations = new Set(LOCATIONS.map((name) => name.toLowerCase()));
const inputTabs = new Set(["keyword input", "website input"]);

export const googleSignInConfigured = Boolean(oauthClientId);

type GoogleTokenClient = {
  requestAccessToken: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string }) => void;
            error_callback: () => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let identityScript: Promise<void> | undefined;

export function loadGoogleIdentity(): Promise<void> {
  if (!oauthClientId || window.google?.accounts?.oauth2)
    return Promise.resolve();
  identityScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      identityScript = undefined;
      reject(new Error("Google sign-in could not load. Try again."));
    };
    document.head.append(script);
  });
  return identityScript;
}

async function requestSheetsToken(scope: string): Promise<string> {
  if (!oauthClientId)
    throw new Error("Google sign-in is not configured for this website.");
  if (!window.google?.accounts?.oauth2) await loadGoogleIdentity();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error("Google sign-in could not load. Try again.");
  return new Promise((resolve, reject) => {
    oauth
      .initTokenClient({
        client_id: oauthClientId,
        scope,
        callback: ({ access_token }) => {
          if (access_token) resolve(access_token);
          else
            reject(
              new Error("Google did not grant the requested Sheets access."),
            );
        },
        error_callback: () =>
          reject(new Error("Google sign-in was closed or blocked. Try again.")),
      })
      .requestAccessToken();
  });
}

export async function saveKeywordSummary(
  spreadsheetId: string,
  rows: (string | number | null | undefined)[][],
): Promise<string> {
  const token = await requestSheetsToken(sheetsWriteScope);
  const sheetId =
    (crypto.getRandomValues(new Uint32Array(1))[0] % 2_000_000_000) + 1;
  const title = `Keyword Summary ${new Date().toISOString().slice(0, 10)} ${sheetId.toString(36)}`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                sheetId,
                title,
                gridProperties: {
                  rowCount: rows.length,
                  columnCount: Math.max(...rows.map((row) => row.length)),
                },
              },
            },
          },
          {
            updateCells: {
              start: { sheetId, rowIndex: 0, columnIndex: 0 },
              fields: "userEnteredValue",
              rows: rows.map((row) => ({
                values: row.map((value) =>
                  value == null
                    ? {}
                    : {
                        userEnteredValue:
                          typeof value === "number"
                            ? { numberValue: value }
                            : { stringValue: value },
                      },
                ),
              })),
            },
          },
        ],
      }),
    },
  );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      "Google could not save the summary. Use a Google account with Editor access.",
    );
  if (!response.ok)
    throw new Error(
      `Google Sheets returned HTTP ${response.status}. Check the Sheet or download the Summary CSV.`,
    );
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit#gid=${sheetId}`;
}

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
  signedIn: boolean,
): Promise<{ name: string; text: string }[]> {
  if (!signedIn && !publicApiKey) return readPublicWorkbook(sheetId);
  const token = signedIn
    ? await requestSheetsToken(sheetsReadScope)
    : undefined;

  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const signal = AbortSignal.timeout(120_000);
  async function get<T>(path: string, params: URLSearchParams): Promise<T> {
    if (!token && publicApiKey) params.set("key", publicApiKey);
    const response = await fetch(`${base}${path}?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        token
          ? "Google could not read this Sheet. Sign in with an account that has access."
          : "Google could not read this Sheet publicly. Try Sign in with Google.",
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
