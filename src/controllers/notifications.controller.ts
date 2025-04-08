import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { Expo } from "expo-server-sdk";
// Import NotificationType from the types file
import { NotificationType } from "../types/NotificationTypes";

const prisma = new PrismaClient();
const expo = new Expo();

export const registerPushToken = async (req: Request, res: Response) => {
  try {
    console.log("Register token request body:", req.body);
    const { token, userId } = req.body;

    if (!token || !userId) {
      console.log("Missing required fields:", { token, userId });
      return res.status(400).json({ error: "Token and userId are required" });
    }

    // First try to find and update existing token
    const existingToken = await prisma.pushToken.findFirst({
      where: { token },
    });

    if (existingToken) {
      // If token exists, update it
      await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: { userId },
      });
    } else {
      // If token doesn't exist, create new one
      await prisma.pushToken.create({
        data: { userId, token },
      });
    }

    return res
      .status(200)
      .json({ message: "Push token registered successfully" });
  } catch (error) {
    console.error("Error registering push token:", error);
    return res.status(500).json({ error: "Failed to register push token" });
  }
};

export const getNotifications = async (req: Request, res: Response) => {
  try {
    console.log("Get notifications query:", req.query);
    const { userId } = req.query;

    if (!userId) {
      console.log("Missing userId in query");
      return res.status(400).json({ error: "UserId is required" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: userId as string },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

export const sendLiveNotification = async (req: Request, res: Response) => {
  try {
    console.log("Send live notification request:", req.body);
    const { userId, username, roomName } = req.body;

    if (!userId || !username) {
      console.log("Missing required fields:", { userId, username });
      return res
        .status(400)
        .json({ error: "UserId and username are required" });
    }

    // Get all push tokens except the sender's
    const pushTokens = await prisma.pushToken.findMany({
      where: {
        userId: {
          not: userId,
        },
      },
    });

    if (!pushTokens.length) {
      return res
        .status(200)
        .json({ message: "No tokens to send notifications to" });
    }

    // Create notification records for each recipient
    const notifications = await Promise.all(
      pushTokens.map((token) =>
        prisma.notification.create({
          data: {
            title: "New Live Stream",
            body: `${username} is now live!`,
            userId: token.userId,
            type: NotificationType.LIVE_STREAM, // Set the type of the notification using the enum
            metadata: { roomName }, // Store roomName in metadata
          },
        })
      )
    );

    // Prepare messages for Expo push notification service
    const messages = pushTokens.map(({ token }) => ({
      to: token,
      sound: "default",
      title: "New Live Stream",
      body: `${username} is now live!`,
      data: { type: "live_stream", userId, roomName },
    }));

    // Filter out invalid tokens
    const validMessages = messages.filter((message) =>
      Expo.isExpoPushToken(message.to)
    );

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(validMessages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error("Error sending notification chunk:", error);
      }
    }

    return res.status(200).json({
      message: "Live notifications sent successfully",
      notificationCount: notifications.length,
    });
  } catch (error) {
    console.error("Error sending live notification:", error);
    return res.status(500).json({ error: "Failed to send live notifications" });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log("Marking notification as read:", id);

    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return res.status(200).json(notification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res
      .status(500)
      .json({ error: "Failed to mark notification as read" });
  }
};

export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "UserId is required" });
    }

    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return res.status(200).json({
      message: "All notifications marked as read",
      updatedCount: result.count,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res
      .status(500)
      .json({ error: "Failed to mark all notifications as read" });
  }
};
