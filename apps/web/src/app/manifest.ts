import type { MetadataRoute } from "next";

/** Installabile sulla schermata Home: si apre sull'app del campo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CantiereOS Campo",
    short_name: "Campo",
    description: "Interventi del giorno, calendario, mappa e storico per chi lavora sul campo.",
    start_url: "/campo",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.png", sizes: "any", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
