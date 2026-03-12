-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Plantilla';
ALTER TABLE "Template" ADD COLUMN     "placeholders" JSONB;
ALTER TABLE "Template" ADD COLUMN     "requiredColumns" JSONB;
ALTER TABLE "Template" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';
