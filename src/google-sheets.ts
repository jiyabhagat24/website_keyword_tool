import { LOCATIONS } from "./config";

const sheetsReadScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
const publicApiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY?.trim();
const oauthClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

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

async function requestReadToken(): Promise<string> {
  if (!oauthClientId)
    throw new Error("Google sign-in is not configured for this website.");
  if (!window.google?.accounts?.oauth2) await loadGoogleIdentity();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error("Google sign-in could not load. Try again.");
  return new Promise((resolve, reject) => {
    oauth
      .initTokenClient({
        client_id: oauthClientId,
        scope: sheetsReadScope,
        callback: ({ access_token }) => {
          if (access_token) resolve(access_token);
          else reject(new Error("Google did not grant read access to Sheets."));
        },
        error_callback: () =>
          reject(new Error("Google sign-in was closed or blocked. Try again.")),
      })
      .requestAccessToken();
  });
}

export function sheetIdFromInput(value: string): string | null {
  const text = value.trim();
  const match = text.match(
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:[/?#]|$)/,
  );
  return match?.[1] ?? (/^[\w-]{16,}$/.test(text) ? text : null);
}

export async function readGoogleSheet(
  sheetId: string,
  signedIn: boolean,
): Promise<{ name: string; text: string }[]> {
  const token = signedIn ? await requestReadToken() : undefined;
  if (!token && !publicApiKey)
    throw new Error(
      "Public Sheet access is not configured. Try Sign in with Google.",
    );

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
  const locations = new Set(LOCATIONS.map((name) => name.toLowerCase()));
  const inputTabs = new Set(["keyword input", "website input"]);
  const titles = (metadata.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => {
      const name = title?.trim().toLowerCase();
      return Boolean(name && (locations.has(name) || inputTabs.has(name)));
    });
  if (!titles.some((title) => locations.has(title.trim().toLowerCase())))
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
    for (const [index, range] of data.valueRanges.entries()) {
      const text = (range.values ?? [])
        .map((row) =>
          row
            .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
            .join(","),
        )
        .join("\r\n");
      sources.push({ name: batch[index] + ".csv", text });
    }
  }
  return sources;
}
