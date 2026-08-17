import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { LOGIN_LINK_EXPIRES_MINUTES } from "@/lib/email-constants";
import { greetingName } from "@/lib/user-name";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loginLinkText(greeting: string, url: string) {
  const hello = greeting ? `Hallo ${greeting}` : "Hallo";
  return `${hello},

hier ist dein Login-Link für Tsüri HQ. Er ist ${LOGIN_LINK_EXPIRES_MINUTES} Minuten gültig und nur einmal nutzbar.

${url}

Falls du keinen Link angefordert hast, kannst du diese Mail ignorieren.
`;
}

function loginLinkHtml(greeting: string, url: string) {
  const hello = greeting ? `Hallo ${escapeHtml(greeting)}` : "Hallo";
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f1;font-family:Figtree,Helvetica,Arial,sans-serif;color:#111;">
    <div style="max-width:520px;margin:0 auto;padding:28px 24px;background:#fff;border-radius:16px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2b9fe0;font-weight:700;">Tsüri HQ</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${hello}</h1>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">
        Hier ist dein Login-Link. Er ist ${LOGIN_LINK_EXPIRES_MINUTES} Minuten gültig und nur einmal nutzbar.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;">
          Anmelden
        </a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#666;">
        Falls der Button nicht geht, diesen Link im Browser öffnen:<br/>
        <a href="${safeUrl}" style="color:#2b9fe0;word-break:break-all;">${safeUrl}</a>
      </p>
    </div>
  </body>
</html>`;
}

export async function sendLoginLinkEmail(email: string, url: string) {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true, firstName: true },
  });
  if (!user) return;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const greeting = greetingName(user);

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Login-Mails sind nicht konfiguriert (RESEND_API_KEY / EMAIL_FROM).",
      );
    }
    console.log(`[magic-link] ${normalized}: ${url}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: normalized,
    subject: "Dein Login-Link für Tsüri HQ",
    html: loginLinkHtml(greeting, url),
    text: loginLinkText(greeting, url),
  });
  if (error) {
    throw new Error(error.message);
  }
}
