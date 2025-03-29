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

  getRooms = async (req: Request, res: Response): Promise<void> => {
    try {
      const rooms = await this.livekitService.getRooms();
      res.json(rooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };
}
