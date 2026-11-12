export interface FillProgress {
  total: number;
  filled: number;
  rows: number;
}

/** Counts the keyword rows in one tab of a link-shared Sheet (0 when empty or unreadable). */
async function tabRows(sheetId: string, tab: string): Promise<number> {
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(tab)}` +
    `&tq=${encodeURIComponent("select count(A)")}`;
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return 0;
  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines.length < 2 || !/keyword/i.test(lines[0])) return 0;
  const count = Number(lines[1].replace(/[^0-9.]/g, ""));
  return Number.isFinite(count) ? count : 0;
}

/** How many of the given location tabs already hold keywords, and the total rows. */
export async function sheetFillProgress(
  sheetId: string,
  tabs: string[],
): Promise<FillProgress> {
  const counts: number[] = [];
  for (let i = 0; i < tabs.length; i += 6) {
    counts.push(
      ...(await Promise.all(
        tabs.slice(i, i + 6).map((tab) => tabRows(sheetId, tab).catch(() => 0)),
      )),
    );
  }
  return {
    total: tabs.length,
    filled: counts.filter((count) => count > 0).length,
    rows: counts.reduce((sum, count) => sum + count, 0),
  };
}
