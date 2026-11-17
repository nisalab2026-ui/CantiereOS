// Sempre ora italiana, sul server e nel browser (come il registro attività).
const dateFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
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

/** Data di oggi nel fuso dell'azienda (Italia), come YYYY-MM-DD. */
export function todayInRome(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

/** Data e ora in Italia nel formato del campo datetime-local ("2026-11-17T09:30"). */
export function romeLocalDateTime(d: Date | string = new Date()): string {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
  return s.replace(" ", "T").slice(0, 16);
}
