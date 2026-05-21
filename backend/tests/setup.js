import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.user.deleteMany();
  await prisma.testSeries.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});