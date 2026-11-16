const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const numberFmt = new Intl.NumberFormat("it-IT");
const relFmt = new Intl.RelativeTimeFormat("it-IT", { numeric: "auto" });

export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d));
export const formatNumber = (n: number) => numberFmt.format(n);

/** "3 minuti fa", "ieri"… */
export function formatRelative(d: Date | string, now = Date.now()): string {
  const diff = (new Date(d).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return relFmt.format(Math.round(diff), "second");
  if (abs < 3600) return relFmt.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return relFmt.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return relFmt.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}
