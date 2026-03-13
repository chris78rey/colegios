-- AlterTable
ALTER TABLE "OmniRequest" ADD COLUMN     "paymentReference" TEXT;

-- CreateTable
CREATE TABLE "RcValidation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "desktopBatchId" TEXT,
    "requestGroupId" TEXT,
    "omniRequestId" TEXT,
    "cedula" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "queryMode" TEXT NOT NULL DEFAULT 'DEMOGRAPHIC',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "codigoDactilarProvided" BOOLEAN NOT NULL DEFAULT false,
    "providerRequestId" TEXT,
    "photoPath" TEXT,
    "signatureGraphPath" TEXT,
    "consentDocumentPath" TEXT,
    "consentFileName" TEXT,
    "lastResultCode" INTEGER,
    "lastResultText" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RcValidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RcValidation_organizationId_status_idx" ON "RcValidation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RcValidation_desktopBatchId_status_idx" ON "RcValidation"("desktopBatchId", "status");

-- CreateIndex
CREATE INDEX "RcValidation_requestGroupId_status_idx" ON "RcValidation"("requestGroupId", "status");

-- CreateIndex
CREATE INDEX "RcValidation_omniRequestId_status_idx" ON "RcValidation"("omniRequestId", "status");

-- CreateIndex
CREATE INDEX "RcValidation_cedula_createdAt_idx" ON "RcValidation"("cedula", "createdAt");

-- AddForeignKey
ALTER TABLE "RcValidation" ADD CONSTRAINT "RcValidation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcValidation" ADD CONSTRAINT "RcValidation_desktopBatchId_fkey" FOREIGN KEY ("desktopBatchId") REFERENCES "DesktopBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcValidation" ADD CONSTRAINT "RcValidation_requestGroupId_fkey" FOREIGN KEY ("requestGroupId") REFERENCES "RequestGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RcValidation" ADD CONSTRAINT "RcValidation_omniRequestId_fkey" FOREIGN KEY ("omniRequestId") REFERENCES "OmniRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
