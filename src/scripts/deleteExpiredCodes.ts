import prisma from "../db";

async function deleteUnusedCodes() {
  try {
    const result = await prisma.inviteCode.deleteMany({
      where: {
        isUsed: false,
      },
    });

    console.log(`Deleted ${result.count} unused invite codes`);
  } catch (error) {
    console.error("Error deleting unused codes:", error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteUnusedCodes();
