-- CreateEnum
CREATE TYPE "AppCapability" AS ENUM ('finance');

-- CreateTable
CREATE TABLE "membership_grant" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "capability" "AppCapability" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_grant_membershipId_capability_key" ON "membership_grant"("membershipId", "capability");

-- AddForeignKey
ALTER TABLE "membership_grant" ADD CONSTRAINT "membership_grant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
