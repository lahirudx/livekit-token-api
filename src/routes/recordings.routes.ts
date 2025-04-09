import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { RecordingService } from "../services/recording.service";
import { S3Service } from "../services/s3.service";

interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

const router = Router();

// Get all recording sessions for the authenticated user
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const sessions = await RecordingService.getRecordingSessions(
      req.user.username
    );
    return res.json(sessions);
  } catch (error) {
    console.error("Failed to fetch recording sessions:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch recording sessions" });
  }
});

// Get a specific recording session
router.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const session = await RecordingService.getRecordingSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Recording session not found" });
    }
    return res.json(session);
  } catch (error) {
    console.error("Failed to fetch recording session:", error);
    return res.status(500).json({ error: "Failed to fetch recording session" });
  }
});

// Get a presigned URL for a recording file
router.get(
  "/stream/:s3Key(*)",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      console.log(
        "Presigned URL request received for s3Key:",
        req.params.s3Key
      );
      const decodedS3Key = decodeURIComponent(req.params.s3Key);
      console.log("Decoded s3Key:", decodedS3Key);

      // Remove the egress ID from the s3Key before generating presigned URL
      const s3Key = decodedS3Key.split("-").slice(0, -1).join("-");
      console.log("Cleaned s3Key for S3:", s3Key);

      const presignedUrl = await S3Service.getPresignedUrl(s3Key);
      return res.json({ url: presignedUrl });
    } catch (error) {
      console.error("Failed to generate presigned URL:", error);
      return res
        .status(500)
        .json({ error: "Failed to generate presigned URL" });
    }
  }
);

export default router;
