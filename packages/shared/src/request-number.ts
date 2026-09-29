const PREFIX = "REQ-";

export function formatRequestNumber(n: number): string {
  return `${PREFIX}${String(n).padStart(4, "0")}`;
}

/** Accepts "REQ-0023", "req-23" or "23". Returns null when not a request number. */
export function parseRequestNumber(value: string): number | null {
  const match = /^(?:req-)?(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
