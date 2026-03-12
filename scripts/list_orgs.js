const { PrismaClient } = require("../services/api/node_modules/@prisma/client");
const prisma = new PrismaClient();
prisma.organization.findMany({ select: { id: true, name: true } })
  .then((r) => { console.log(JSON.stringify(r)); })
  .finally(() => prisma.$disconnect());
