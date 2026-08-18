-- Pin selected projects into the app sidebar.
ALTER TABLE "space" ADD COLUMN "navPinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "space_organizationId_type_navPinned_idx" ON "space"("organizationId", "type", "navPinned");
