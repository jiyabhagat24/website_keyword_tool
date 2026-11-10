export function sheetIdFromInput(value: string): string | null {
  const text = value.trim();
  const match = text.match(
    /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:[/?#]|$)/,
  );
  return match?.[1] ?? (/^[\w-]{16,}$/.test(text) ? text : null);
}
