import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 12);
  await prisma.user.upsert({
    where: { email: "admin@jobmatch.local" },
    create: {
      name: "Platform Admin",
      email: "admin@jobmatch.local",
      passwordHash,
      role: Role.ADMIN,
      emailVerified: true,
    },
    update: {},
  });
  console.log("Seed complete: admin@jobmatch.local / Admin123!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
