import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { RegisterPayload, LoginPayload } from "../types/auth";

export class AuthController {
  private static instance: AuthController;
  private authService: AuthService;

  private constructor() {
    this.authService = AuthService.getInstance();
  }

  public static getInstance(): AuthController {
    if (!AuthController.instance) {
      AuthController.instance = new AuthController();
    }
    return AuthController.instance;
  }

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Registration request body:", req.body);
      const payload: RegisterPayload = req.body;
      const result = await this.authService.register(payload);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(400).json({
        message: error.message || "Registration failed",
        details: error.toString(),
      });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload: LoginPayload = req.body;
      const result = await this.authService.login(payload);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  getMe = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(200).json({ userId: req.user?.userId });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  };
}
