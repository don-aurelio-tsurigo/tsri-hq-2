-- Finance: Token pro Organisation für den Deal-Webhook (Zapier / Pipedrive)
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "financeWebhookToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "organization_financeWebhookToken_key" ON "organization"("financeWebhookToken");
