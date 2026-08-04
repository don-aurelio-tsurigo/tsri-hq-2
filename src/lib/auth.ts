import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/lib/db";

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
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
});

export type Session = typeof auth.$Infer.Session;
