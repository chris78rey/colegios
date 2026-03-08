-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "batchId" TEXT;
ALTER TABLE "Request" ADD COLUMN     "docxPath" TEXT;
ALTER TABLE "Request" ADD COLUMN     "pdfPath" TEXT;

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "docxZipPath" TEXT,
    "pdfZipPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Batch_organizationId_status_idx" ON "Batch"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Batch_templateId_idx" ON "Batch"("templateId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
