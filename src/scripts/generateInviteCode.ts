import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function generateInviteCode() {
  try {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const inviteCode = await prisma.inviteCode.create({
      data: { code },
    });

    console.log("Generated invite code:", inviteCode.code);
  } catch (error) {
    console.error("Error generating invite code:", error);
  } finally {
    await prisma.$disconnect();
  }
}

generateInviteCode();
