/** Reads the run marker written by the collection workflow after each chain finishes. */
export async function collectionProgress(sheetId: string, runId: string) {
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: `Collection ${runId}`,
    range: "A1:B5",
    headers: "0",
  });
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${params}`,
    {
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) return null;
  const [first, ...chains] = (await response.text()).trim().split(/\r?\n/);
  const [token, size] = first.replaceAll('"', "").split(",");
  const total = Number(size);
  if (token !== runId || !Number.isInteger(total) || total < 1 || total > 4)
    return null;
  const finished = chains
    .slice(0, total)
    .filter(
      (line) => line.split(",")[0].replaceAll('"', "").trim() === "complete",
    ).length;
  return { total, finished };
}
