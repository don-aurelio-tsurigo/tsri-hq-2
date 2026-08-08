import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/**
 * Prefer same-origin so local port switches (3000/3001) don't break sign-in.
 * NEXT_PUBLIC_APP_URL remains a fallback for non-browser contexts.
 */
export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL,
  plugins: [magicLinkClient()],
});
