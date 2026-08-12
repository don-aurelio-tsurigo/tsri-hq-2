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
