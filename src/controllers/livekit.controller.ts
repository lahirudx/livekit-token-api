import { Request, Response } from "express";
import { LiveKitService } from "../services/livekit.service";

export class LiveKitController {
  private static instance: LiveKitController;
  private livekitService: LiveKitService;

  private constructor() {
    this.livekitService = LiveKitService.getInstance();
  }

  public static getInstance(): LiveKitController {
    if (!LiveKitController.instance) {
      LiveKitController.instance = new LiveKitController();
    }
    return LiveKitController.instance;
  }

  getToken = async (req: Request, res: Response): Promise<void> => {
    const { room, username, isSource } = req.body;

    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    try {
      // For non-source users, check if room is active before creating a token
      if (!isSource && room) {
        const isRoomActive = await this.livekitService.isRoomActive(room);
        if (!isRoomActive) {
          console.log(
            `[LiveKitController] Room ${room} is not active, rejecting join request from ${username}`
          );
          res.status(404).json({
            error: "Room not found or has ended",
            roomEnded: true,
          });
          return;
        }
      }

      const {
        token,
        room: roomId,
        displayName,
        isSource: isUserSource,
      } = await this.livekitService.createTokenAndRoom(
        username,
        room,
        isSource
      );

      res.json({
        token,
        room: roomId,
        displayName,
        isSource: isUserSource,
      });
    } catch (error) {
      console.error("Error creating token:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };

  deleteRoom = async (req: Request, res: Response): Promise<void> => {
    const { roomName } = req.params;

    if (!roomName) {
      res.status(400).json({ error: "Room name is required" });
      return;
    }

    try {
      await this.livekitService.terminateRoom(roomName);
      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      console.error("Error deleting room:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };

  getRooms = async (_req: Request, res: Response): Promise<void> => {
    try {
      const rooms = await this.livekitService.getRooms();
      res.json(rooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };

  cleanupDuplicateRooms = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      await this.livekitService.cleanupDuplicateSourceRooms();
      res.json({ message: "Duplicate rooms cleaned up successfully" });
    } catch (error) {
      console.error("Error cleaning up duplicate rooms:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };
}
