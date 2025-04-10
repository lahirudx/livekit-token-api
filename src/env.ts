import { cleanEnv, str, num } from "envalid";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

export const env = cleanEnv(process.env, {
  // LiveKit
  LIVEKIT_API_KEY: str(),
  LIVEKIT_API_SECRET: str(),
  LIVEKIT_URL: str(),

  // AWS
  AWS_ACCESS_KEY_ID: str(),
  AWS_SECRET_ACCESS_KEY: str(),
  AWS_REGION: str(),
  AWS_BUCKET_NAME: str(),

  // JWT
  JWT_SECRET: str(),

  // Server
  PORT: num({ default: 3000 }),
});
