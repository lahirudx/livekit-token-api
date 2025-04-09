import "./env";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import authRoutes from "./routes/auth.routes";
import livekitRoutes from "./routes/livekit.routes";
import notificationRoutes from "./routes/notifications.routes";
import recordingsRoutes from "./routes/recordings.routes";
import { SocketService } from "./services/socket.service";
import prisma from "./db";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
SocketService.getInstance(httpServer);

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/livekit", livekitRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/recordings", recordingsRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

// Initialize database connection
prisma
  .$connect()
  .then(() => {
    console.log("Database connected successfully");

    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(
        "Make sure this server is accessible from your device's network"
      );
    });
  })
  .catch((error) => {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  });
