-- Projekt-Pins in der Seitenleiste pro Person statt global (bestehende Pins werden verworfen)
CREATE TABLE "project_nav_pin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_nav_pin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_nav_pin_userId_spaceId_key" ON "project_nav_pin"("userId", "spaceId");
CREATE INDEX "project_nav_pin_spaceId_idx" ON "project_nav_pin"("spaceId");

ALTER TABLE "project_nav_pin" ADD CONSTRAINT "project_nav_pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_nav_pin" ADD CONSTRAINT "project_nav_pin_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "space_organizationId_type_navPinned_idx";
ALTER TABLE "space" DROP COLUMN "navPinned";
