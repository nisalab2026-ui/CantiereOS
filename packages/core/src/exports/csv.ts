/**
 * CSV compatibile con Excel in italiano: UTF-8 con BOM, separatore `;`,
 * righe CRLF, virgolette solo dove servono. I testi che iniziano con
 * = + - @ (o tab/CR) vengono preceduti da un apostrofo, così un foglio di
 * calcolo non li esegue come formule (CSV injection).
 */
export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const FORMULA_START = /^[=+\-@\t\r]/;
const dateFmt = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "boolean") s = v ? "Sì" : "No";
  else if (typeof v === "number") s = Number.isFinite(v) ? String(v).replace(".", ",") : "";
  else if (v instanceof Date) s = Number.isNaN(v.getTime()) ? "" : dateFmt.format(v);
  else {
    s = v;
    if (FORMULA_START.test(s)) s = `'${s}`;
  }
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(";")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
