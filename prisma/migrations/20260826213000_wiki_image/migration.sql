-- CreateTable
CREATE TABLE "wiki_image" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_image_r2Key_key" ON "wiki_image"("r2Key");

-- CreateIndex
CREATE INDEX "wiki_image_organizationId_createdAt_idx" ON "wiki_image"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "wiki_image_uploadedById_idx" ON "wiki_image"("uploadedById");

-- AddForeignKey
ALTER TABLE "wiki_image" ADD CONSTRAINT "wiki_image_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_image" ADD CONSTRAINT "wiki_image_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
