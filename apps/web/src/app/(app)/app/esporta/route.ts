import { AuthError, EXPORT_SECTIONS, exportSection, type ExportSection } from "@cantiereos/core";
import { NextResponse, type NextRequest } from "next/server";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * POST /app/esporta: scarica in CSV la lista indicata con i filtri correnti.
 * Solo POST (niente prefetch o link esterni che registrano esportazioni) e
 * solo dalla stessa origine. Permessi e azienda dal server; RLS nel database.
 */
const FILTER_KEYS = [
  "q",
  "sort",
  "dir",
  "type",
  "status",
  "state",
  "kind",
  "responsible",
  "from",
  "to",
  "sezione",
  "operazione",
  "utente",
  "folder",
  "category",
  "expiry",
] as const;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env().APP_URL).origin) {
    return new NextResponse("Origine non consentita", { status: 403 });
  }
  const form = await request.formData();
  const section = String(form.get("section") ?? "");
  if (!(EXPORT_SECTIONS as readonly string[]).includes(section)) {
    return new NextResponse("Sezione non valida", { status: 400 });
  }
  const params: Record<string, string | undefined> = {};
  for (const k of FILTER_KEYS) {
    const v = form.get(k);
    if (typeof v === "string" && v !== "") params[k] = v.slice(0, 200);
  }
  const { access } = await getAppContext();
  try {
    const result = await asCurrentUser((tx) =>
      exportSection(tx, access, section as ExportSection, params),
    );
    return new NextResponse(result.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
        "x-export-rows": String(result.rows),
        "x-export-truncated": result.truncated ? "1" : "0",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return new NextResponse("Non hai il permesso di esportare questa sezione", { status: 403 });
    }
    throw error;
  }
}
