import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { LOGIN_LINK_EXPIRES_MINUTES } from "@/lib/email-constants";
import { sendLoginLinkEmail } from "@/lib/email";

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
      disableSignUp: true,
      expiresIn: LOGIN_LINK_EXPIRES_MINUTES * 60,
      sendMagicLink: async ({ email, url }) => {
        await sendLoginLinkEmail(email, url);
      },
    }),
  ],
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        input: false,
      },
      lastName: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
