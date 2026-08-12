import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/lib/db";

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  ...(process.env.ADDITIONAL_TRUSTED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? []),
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
].filter((v): v is string => !!v);

// #region agent log
const debugAuthPayload = {
  sessionId: "b0fde8",
  runId: "pre-fix",
  hypothesisId: "A-B",
  location: "src/lib/auth.ts:init",
  message: "better-auth trustedOrigins resolved",
  data: {
    trustedOrigins,
    betterAuthUrlSet: Boolean(process.env.BETTER_AUTH_URL),
    betterAuthUrlValue: process.env.BETTER_AUTH_URL ?? null,
    nextPublicAppUrlSet: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    nextPublicAppUrlValue: process.env.NEXT_PUBLIC_APP_URL ?? null,
    additionalTrustedOriginsRaw:
      process.env.ADDITIONAL_TRUSTED_ORIGINS ?? null,
    includesTsriHub: trustedOrigins.includes("https://tsri-hub.online"),
    includesTsriHubTrailing: trustedOrigins.includes(
      "https://tsri-hub.online/",
    ),
  },
  timestamp: Date.now(),
};
console.log("[debug-auth]", JSON.stringify(debugAuthPayload));
fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Debug-Session-Id": "b0fde8",
  },
  body: JSON.stringify(debugAuthPayload),
}).catch(() => {});
// #endregion

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Public signup is closed — users join via invitation flow only.
    disableSignUp: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Dev: log link. Replace with real email provider in production.
        console.log(`[magic-link] ${email}: ${url}`);
      },
    }),
  ],
  user: {
    additionalFields: {},
  },
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
