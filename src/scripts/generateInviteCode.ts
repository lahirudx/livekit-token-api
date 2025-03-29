import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Function to generate random codes
function generateRandomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Function to check if a code already exists in the database
async function codeExists(code: string) {
  const existingCode = await prisma.inviteCode.findUnique({
    where: { code },
  });
  return !!existingCode;
}

async function generateInviteCodes(amount: number = 1) {
  try {
    console.log(`Generating ${amount} invite codes...`);
    const codes: string[] = [];

    // Generate random codes
    for (let i = 0; i < amount; i++) {
      let code;
      let exists;

      // Keep trying until we get a unique code
      do {
        code = generateRandomCode();
        exists = await codeExists(code);
        if (exists) {
          console.log(`Code ${code} already exists, trying another...`);
        }
      } while (exists);

      codes.push(code);
    }

    // Save codes to a text file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(
      __dirname,
      `../../invite-codes-${timestamp}.txt`
    );

    fs.writeFileSync(filePath, codes.join("\n"));

    console.log(`Generated ${codes.length} invite codes:`);
    codes.forEach((code) => console.log(code));
    console.log(`\nCodes have been saved to: ${filePath}`);

    return codes;
  } catch (error) {
    console.error("Error generating invite codes:", error);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

// Get the amount from command line arguments, default to 1 if not provided
const amount = parseInt(process.argv[2]) || 1;
generateInviteCodes(amount);
