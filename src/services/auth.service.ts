import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RegisterPayload, LoginPayload, AuthResponse } from "../types/auth";

const prisma = new PrismaClient();

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
    const { email, password, inviteCode } = payload;

    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode, isUsed: false },
    });

    if (!invite) {
      throw new Error("Invalid or used invite code");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        inviteCode: {
          connect: { id: invite.id },
        },
      },
    });

    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: { isUsed: true },
    });

    const token = this.generateToken(user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const { email, password } = payload;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    const token = this.generateToken(user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  private generateToken(userId: string): string {
    return jwt.sign({ userId }, this.JWT_SECRET, {
      expiresIn: "7d",
    });
  }

  verifyToken(token: string): { userId: string } {
    return jwt.verify(token, this.JWT_SECRET) as { userId: string };
  }
}
