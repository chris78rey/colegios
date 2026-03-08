import { PrismaClient } from "../services/api/node_modules/@prisma/client/index.js";

const prisma = new PrismaClient();
const name = process.argv[2] || "Solicitud Matricula";
const template = await prisma.template.findFirst({
  where: { name, status: "active" },
  select: { id: true, name: true },
});
if (!template) {
  console.log("NOT_FOUND");
  await prisma.$disconnect();
  process.exit(0);
}
const [inRequest, inBatch, inGroup] = await Promise.all([
  prisma.request.findFirst({ where: { templateId: template.id }, select: { id: true } }),
  prisma.batch.findFirst({ where: { templateId: template.id }, select: { id: true } }),
  prisma.templateGroupItem.findFirst({ where: { templateId: template.id }, select: { id: true } }),
]);
console.log(JSON.stringify({ template, inRequest: !!inRequest, inBatch: !!inBatch, inGroup: !!inGroup }));
await prisma.$disconnect();
