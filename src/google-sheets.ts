import { LOCATIONS } from "./config";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (result: {
              access_token?: string;
              error?: string;
            }) => void;
            error_callback: (error: { type?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

let identityScript: Promise<void> | undefined;
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (!identityScript) {
    identityScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        identityScript = undefined;
        reject(
          new Error(
            "Google sign-in could not load. Check your connection and try again.",
          ),
        );
      };
      document.head.append(script);
    });
  }
  return identityScript;
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
): Promise<{ name: string; text: string }[]> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId)
    throw new Error(
      "Google sign-in is not configured yet. Set VITE_GOOGLE_CLIENT_ID when building the website.",
    );
  await loadGoogleIdentity();
  const token = await new Promise<string>((resolve, reject) => {
    window
      .google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        callback: (result) =>
          result.access_token
            ? resolve(result.access_token)
            : reject(
                new Error("Google did not grant access to the spreadsheet."),
              ),
        error_callback: () =>
          reject(
            new Error(
              "Google sign-in was closed or blocked. Allow pop-ups and try again.",
            ),
          ),
      })
      .requestAccessToken();
  });
  async function getJson(url: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new Error(
          "Google could not access this sheet. Sign in with an account that can view it.",
        );
      throw new Error(
        `Google Sheets returned an error (${response.status}). Check the sheet link and try again.`,
      );
    }
    return response.json();
  }
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const metadata = await getJson(base + "?fields=sheets(properties(title))");
  const wanted = new Set(
    [...LOCATIONS, "Keyword input", "Website Input"].map((name) =>
      name.toLowerCase(),
    ),
  );
  const titles: string[] = (metadata.sheets ?? [])
    .map(
      (sheet: { properties?: { title?: string } }) => sheet.properties?.title,
    )
    .filter(
      (title: unknown): title is string =>
        typeof title === "string" && wanted.has(title.trim().toLowerCase()),
    );
  if (
    !titles.some((title) =>
      LOCATIONS.some(
        (name) => name.toLowerCase() === title.trim().toLowerCase(),
      ),
    )
  )
    throw new Error("No recognized location tabs were found in this sheet.");
  const sources: { name: string; text: string }[] = [];
  for (const title of titles) {
    const range = "'" + title.replace(/'/g, "''") + "'";
    const result = await getJson(
      `${base}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
    );
    const text = (result.values ?? [])
      .map((row: unknown[]) =>
        row
          .map((value) => '"' + String(value ?? "").replace(/"/g, '""') + '"')
          .join(","),
      )
      .join("\r\n");
    sources.push({ name: title + ".csv", text });
  }
  return sources;
}
