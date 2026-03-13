-- CreateTable
CREATE TABLE "DesktopBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceExcel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedByEmail" TEXT,
    "manifestJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesktopBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesktopDocument" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "groupKey" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "outputName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "pdfPath" TEXT NOT NULL,
    "rowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesktopDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesktopBatch_organizationId_status_idx" ON "DesktopBatch"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DesktopDocument_batchId_rowIndex_idx" ON "DesktopDocument"("batchId", "rowIndex");

-- CreateIndex
CREATE INDEX "DesktopDocument_groupKey_idx" ON "DesktopDocument"("groupKey");

-- CreateIndex
CREATE INDEX "DesktopDocument_status_idx" ON "DesktopDocument"("status");

-- AddForeignKey
ALTER TABLE "DesktopBatch" ADD CONSTRAINT "DesktopBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesktopDocument" ADD CONSTRAINT "DesktopDocument_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DesktopBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
