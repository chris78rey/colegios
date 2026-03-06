import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = "ChristianReinaldo";
  const result = await prisma.user.updateMany({
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });
  console.log(`Updated users: ${result.count}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
