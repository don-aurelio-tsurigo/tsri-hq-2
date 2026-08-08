-- CreateTable
CREATE TABLE "carousel_post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slides" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carousel_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carousel_post_createdById_idx" ON "carousel_post"("createdById");

-- AddForeignKey
ALTER TABLE "carousel_post" ADD CONSTRAINT "carousel_post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
