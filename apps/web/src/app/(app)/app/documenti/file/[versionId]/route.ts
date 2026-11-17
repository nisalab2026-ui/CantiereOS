import { AuthError, getDownloadUrl } from "@cantiereos/core";
import { NextResponse, type NextRequest } from "next/server";
import { asCurrentUser, getAppContext } from "@/lib/auth";
import { fileStorage } from "@/lib/storage";

/**
 * GET /app/documenti/file/{versione}[?anteprima=1]: controlla i permessi (RLS),
 * registra il download e reindirizza a un URL firmato valido 5 minuti.
 * Solo navigazioni dalla stessa origine (niente link incorporati in siti esterni).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new NextResponse("Richiesta non consentita", { status: 403 });
  }
  const storage = fileStorage();
  if (!storage) return new NextResponse("Archiviazione file non configurata", { status: 503 });
  const { versionId } = await params;
  const preview = request.nextUrl.searchParams.get("anteprima") === "1";
  const { access } = await getAppContext();
  try {
    const result = await asCurrentUser((tx) =>
      getDownloadUrl(tx, access, storage, versionId, preview ? "preview" : "download"),
    );
    if (!result) return new NextResponse("Documento non trovato", { status: 404 });
    const res = NextResponse.redirect(result.url, 303);
    res.headers.set("cache-control", "no-store");
    res.headers.set("referrer-policy", "no-referrer");
    return res;
  } catch (error) {
    if (error instanceof AuthError) {
      return new NextResponse("Non hai il permesso di vedere questo documento", { status: 403 });
    }
    throw error;
  }
}
