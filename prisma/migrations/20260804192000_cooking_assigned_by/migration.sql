-- AlterTable
ALTER TABLE "cooking_slot" ADD COLUMN "assignedById" TEXT;

-- CreateIndex
CREATE INDEX "cooking_slot_assignedById_idx" ON "cooking_slot"("assignedById");

-- AddForeignKey
ALTER TABLE "cooking_slot" ADD CONSTRAINT "cooking_slot_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
