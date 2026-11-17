import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS obbligatorio per due anni sul dominio (ignorato dai browser su http/localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // La Content-Security-Policy con nonce per richiesta è impostata in src/proxy.ts.
];

const config: NextConfig = {
  // packages/core è distribuito come sorgente TypeScript del monorepo.
  transpilePackages: ["@cantiereos/core"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // le regole per gli assistenti sono in CLAUDE.md alla radice del repository
  agentRules: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // I link d'invito e di recupero contengono segreti: niente referrer, niente cache.
      {
        source: "/(invito|auth/callback|reimposta-password)(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default config;
