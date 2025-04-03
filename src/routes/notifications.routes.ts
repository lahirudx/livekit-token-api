import express from "express";
import {
  registerPushToken,
  getNotifications,
  sendLiveNotification,
  markNotificationAsRead,
} from "../controllers/notifications.controller";

const router = express.Router();

router.post("/register-token", registerPushToken);
router.get("/", getNotifications);
router.post("/send-live", sendLiveNotification);
router.put("/:id/read", markNotificationAsRead);

export default router;
