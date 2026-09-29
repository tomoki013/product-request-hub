const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));

/** Reads an optional form value; "" becomes null (cleared), missing stays undefined. */
export function formValue(form: FormData, key: string): string | null | undefined {
  const v = form.get(key);
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? null : s;
}
