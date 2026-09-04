import { SlackCookingNotificationSettings } from "@/components/slack-cooking-notification-settings";
import { SlackFeedbackNotificationSettings } from "@/components/slack-feedback-notification-settings";
import { prisma } from "@/lib/db";
import { isSlackWebhookConfigured } from "@/lib/notifications/slack";
import { requireAdmin } from "@/lib/session";

export default async function NotificationsSettingsPage() {
  const { membership } = await requireAdmin();

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: membership.organizationId },
    select: {
      slackCookingWeeklyEnabled: true,
      slackCookingMonthlyEnabled: true,
      slackCookingWeeklyWebhookUrl: true,
      slackCookingMonthlyWebhookUrl: true,
      slackFeedbackDigestEnabled: true,
      slackFeedbackDigestWebhookUrl: true,
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Einstellungen
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Benachrichtigungen
        </h1>
      </header>

      <SlackCookingNotificationSettings
        weeklyEnabled={org.slackCookingWeeklyEnabled}
        monthlyEnabled={org.slackCookingMonthlyEnabled}
        weeklyWebhookUrl={org.slackCookingWeeklyWebhookUrl ?? ""}
        monthlyWebhookUrl={org.slackCookingMonthlyWebhookUrl ?? ""}
        envWebhookConfigured={isSlackWebhookConfigured(null)}
      />

      <SlackFeedbackNotificationSettings
        enabled={org.slackFeedbackDigestEnabled}
        webhookUrl={org.slackFeedbackDigestWebhookUrl ?? ""}
        envWebhookConfigured={isSlackWebhookConfigured(null)}
      />
    </div>
  );
}
