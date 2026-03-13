-- CreateTable
CREATE TABLE "OmniRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestGroupId" TEXT,
    "desktopBatchId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'OMNISWITCH',
    "providerRequestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idProcess" INTEGER,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "signatoryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "lastProviderStatus" TEXT,
    "lastResultCode" INTEGER,
    "lastResultText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmniRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmniDocument" (
    "id" TEXT NOT NULL,
    "omniRequestId" TEXT NOT NULL,
    "requestId" TEXT,
    "desktopDocumentId" TEXT,
    "providerDocumentName" TEXT NOT NULL,
    "localPdfPath" TEXT,
    "signedPdfPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pageCount" INTEGER,
    "fileSizeBytes" INTEGER,
    "providerSignedFlag" TEXT,
    "downloadedAt" TIMESTAMP(3),
    "lastResultCode" INTEGER,
    "lastResultText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmniDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmniEvent" (
    "id" TEXT NOT NULL,
    "omniRequestId" TEXT NOT NULL,
    "omniDocumentId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OmniEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OmniRequest_organizationId_status_idx" ON "OmniRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OmniRequest_providerRequestId_idx" ON "OmniRequest"("providerRequestId");

-- CreateIndex
CREATE INDEX "OmniRequest_requestGroupId_idx" ON "OmniRequest"("requestGroupId");

-- CreateIndex
CREATE INDEX "OmniRequest_desktopBatchId_idx" ON "OmniRequest"("desktopBatchId");

-- CreateIndex
CREATE INDEX "OmniDocument_omniRequestId_status_idx" ON "OmniDocument"("omniRequestId", "status");

-- CreateIndex
CREATE INDEX "OmniDocument_requestId_idx" ON "OmniDocument"("requestId");

-- CreateIndex
CREATE INDEX "OmniDocument_desktopDocumentId_idx" ON "OmniDocument"("desktopDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "OmniDocument_omniRequestId_providerDocumentName_key" ON "OmniDocument"("omniRequestId", "providerDocumentName");

-- CreateIndex
CREATE INDEX "OmniEvent_omniRequestId_createdAt_idx" ON "OmniEvent"("omniRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "OmniEvent_omniDocumentId_createdAt_idx" ON "OmniEvent"("omniDocumentId", "createdAt");

-- AddForeignKey
ALTER TABLE "OmniRequest" ADD CONSTRAINT "OmniRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniRequest" ADD CONSTRAINT "OmniRequest_requestGroupId_fkey" FOREIGN KEY ("requestGroupId") REFERENCES "RequestGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniRequest" ADD CONSTRAINT "OmniRequest_desktopBatchId_fkey" FOREIGN KEY ("desktopBatchId") REFERENCES "DesktopBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniDocument" ADD CONSTRAINT "OmniDocument_omniRequestId_fkey" FOREIGN KEY ("omniRequestId") REFERENCES "OmniRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniDocument" ADD CONSTRAINT "OmniDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniDocument" ADD CONSTRAINT "OmniDocument_desktopDocumentId_fkey" FOREIGN KEY ("desktopDocumentId") REFERENCES "DesktopDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniEvent" ADD CONSTRAINT "OmniEvent_omniRequestId_fkey" FOREIGN KEY ("omniRequestId") REFERENCES "OmniRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OmniEvent" ADD CONSTRAINT "OmniEvent_omniDocumentId_fkey" FOREIGN KEY ("omniDocumentId") REFERENCES "OmniDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
