-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "requestGroupId" TEXT;

-- CreateTable
CREATE TABLE "TemplateGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateGroupItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiredSigners" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "docxZipPath" TEXT,
    "pdfZipPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestGroup" (
    "id" TEXT NOT NULL,
    "batchGroupId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateGroup_organizationId_idx" ON "TemplateGroup"("organizationId");

-- CreateIndex
CREATE INDEX "TemplateGroupItem_groupId_idx" ON "TemplateGroupItem"("groupId");

-- CreateIndex
CREATE INDEX "TemplateGroupItem_templateId_idx" ON "TemplateGroupItem"("templateId");

-- CreateIndex
CREATE INDEX "BatchGroup_organizationId_status_idx" ON "BatchGroup"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BatchGroup_groupId_idx" ON "BatchGroup"("groupId");

-- CreateIndex
CREATE INDEX "RequestGroup_batchGroupId_idx" ON "RequestGroup"("batchGroupId");

-- CreateIndex
CREATE INDEX "RequestGroup_status_idx" ON "RequestGroup"("status");

-- CreateIndex
CREATE INDEX "Request_requestGroupId_idx" ON "Request"("requestGroupId");

-- AddForeignKey
ALTER TABLE "TemplateGroup" ADD CONSTRAINT "TemplateGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGroupItem" ADD CONSTRAINT "TemplateGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TemplateGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateGroupItem" ADD CONSTRAINT "TemplateGroupItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_requestGroupId_fkey" FOREIGN KEY ("requestGroupId") REFERENCES "RequestGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchGroup" ADD CONSTRAINT "BatchGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchGroup" ADD CONSTRAINT "BatchGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TemplateGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestGroup" ADD CONSTRAINT "RequestGroup_batchGroupId_fkey" FOREIGN KEY ("batchGroupId") REFERENCES "BatchGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
