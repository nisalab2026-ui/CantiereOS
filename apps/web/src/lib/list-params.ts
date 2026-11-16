/**
 * Parametri di lista (ricerca, ordinamento, filtri, pagina) letti dall'URL e
 * validati contro una whitelist: nessun valore dell'URL finisce nell'SQL
 * se non è tra quelli ammessi.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams<S extends string, F extends string> {
  q: string;
  sort: S;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  filters: Partial<Record<F, string>>;
}

export function parseListParams<S extends string, F extends string>(
  sp: SearchParams,
  config: {
    sorts: readonly S[];
    defaultSort: S;
    filters?: Partial<Record<F, readonly string[]>>;
    pageSize?: number;
  },
): ListParams<S, F> {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const sort = (config.sorts as readonly string[]).includes(one("sort") ?? "")
    ? (one("sort") as S)
    : config.defaultSort;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one("page") ?? "1", 10) || 1));
  const filters: Partial<Record<F, string>> = {};
  for (const [key, allowed] of Object.entries(config.filters ?? {}) as [F, readonly string[]][]) {
    const value = one(key);
    if (value && allowed.includes(value)) filters[key] = value;
  }
  return {
    q: (one("q") ?? "").trim().slice(0, 100),
    sort,
    dir: one("dir") === "desc" ? "desc" : "asc",
    page,
    pageSize: config.pageSize ?? 25,
    filters,
  };
}

/** URL della stessa lista con alcuni parametri cambiati (null = rimosso). */
export function listHref(
  pathname: string,
  current: SearchParams,
  changes: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === "string" && v !== "") params.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
