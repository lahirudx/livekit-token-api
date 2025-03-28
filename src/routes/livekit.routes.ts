import { Router } from "express";
import { LiveKitController } from "../controllers/livekit.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();
const livekitController = LiveKitController.getInstance();

router.post("/get-token", authMiddleware, livekitController.getToken);
router.delete("/rooms/:roomName", authMiddleware, livekitController.deleteRoom);

export default router;
