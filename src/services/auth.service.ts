import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RegisterPayload, LoginPayload, AuthResponse } from "../types/auth";
import prisma from "../db";

export class AuthService {
  private static instance: AuthService;
  private readonly JWT_SECRET = process.env.JWT_SECRET!;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const { username, password, inviteCode } = payload;
    console.log("Registration attempt:", { username, inviteCode });

    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode, isUsed: false },
    });
    console.log("Found invite:", invite);

    if (!invite) {
      throw new Error("Invalid or used invite code");
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new Error("Invite code has expired");
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });
    console.log("Existing user check:", existingUser);

    if (existingUser) {
      throw new Error("Username already taken");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
        },
      });
      console.log("Created user:", user);

      await prisma.inviteCode.update({
        where: { id: invite.id },
        data: {
          isUsed: true,
          userId: user.id,
        },
      });

      const token = this.generateToken(user.id, user.username);

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      };
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { username, password } = payload;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    const token = this.generateToken(user.id, user.username);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  private generateToken(userId: string, username: string): string {
    return jwt.sign({ userId, username }, this.JWT_SECRET, {
      expiresIn: "7d",
    });
  }

  verifyToken(token: string): { userId: string; username: string } {
    return jwt.verify(token, this.JWT_SECRET) as {
      userId: string;
      username: string;
    };
  }
}
