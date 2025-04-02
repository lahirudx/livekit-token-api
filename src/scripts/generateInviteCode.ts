import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Calculate total possible combinations (36^6)
const TOTAL_COMBINATIONS = Math.pow(36, 6);
const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function calculatePossibleCombinations(usedCodes: number): void {
  const remaining = TOTAL_COMBINATIONS - usedCodes;
  const percentageUsed = (usedCodes / TOTAL_COMBINATIONS) * 100;

  console.log(`\nCombination Statistics:`);
  console.log(
    `Total possible combinations: ${TOTAL_COMBINATIONS.toLocaleString()}`
  );
  console.log(`Used combinations: ${usedCodes.toLocaleString()}`);
  console.log(`Remaining combinations: ${remaining.toLocaleString()}`);
  console.log(`Percentage used: ${percentageUsed.toFixed(4)}%`);

  if (percentageUsed > 50) {
    console.log(
      "\n⚠️ Warning: Over 50% of possible combinations have been used!"
    );
  }
}

async function generateUniqueCode(): Promise<string> {
  while (true) {
    const code = Array.from(
      { length: 6 },
      () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    ).join("");
    const existing = await prisma.inviteCode.findUnique({
      where: { code },
    });
    if (!existing) {
      return code;
    }
  }
}

async function generateInviteCodes(count: number = 1, daysValid: number = 7) {
  try {
    const codes = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);

    for (let i = 0; i < count; i++) {
      const code = await generateUniqueCode();
      const inviteCode = await prisma.inviteCode.create({
        data: {
          code,
          isUsed: false,
          userId: null,
          expiresAt,
        },
      });
      codes.push(inviteCode);
    }

    // Get total used codes for statistics
    const usedCodes = await prisma.inviteCode.count();
    calculatePossibleCombinations(usedCodes);

    console.log(
      `\nGenerated ${count} invite code(s) valid for ${daysValid} days:`
    );
    codes.forEach((inviteCode) => {
      console.log(`Code: ${inviteCode.code}`);
      console.log(
        `Expires: ${inviteCode.expiresAt?.toLocaleString() || "No expiration"}`
      );
      console.log("---");
    });
  } catch (error) {
    console.error("Error generating invite codes:", error);
  } finally {
    await prisma.$disconnect();
  }
}

const count = parseInt(process.argv[2]) || 1;
const daysValid = parseInt(process.argv[3]) || 7;
generateInviteCodes(count, daysValid);
