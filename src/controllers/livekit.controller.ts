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
    const { username, room, isHost } = req.body;

    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    try {
      const result = await this.livekitService.createTokenAndRoom(
        username,
        room,
        isHost
      );
      res.json(result);
    } catch (error) {
      console.error("Error generating token:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };

  deleteRoom = async (req: Request, res: Response): Promise<void> => {
    const { roomName } = req.params;
    const { username } = req.query;

    try {
      const result = await this.livekitService.terminateRoom(roomName);
      res.json({ message: "Room terminated successfully", ...result });
    } catch (error) {
      console.error("Error terminating room:", error);
      res
        .status(500)
        .json({ message: "Failed to terminate room", error: error.message });
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

  participantLeft = async (req: Request, res: Response): Promise<void> => {
    const { room, username } = req.body;

    if (!room || !username) {
      res.status(400).json({ error: "Room and username are required" });
      return;
    }

    try {
      // Check if room has other participants
      const rooms = await this.livekitService.getRooms();
      const targetRoom = rooms.find((r) => r.id === room);

      // If room has 0 or 1 participants (including the one leaving), delete it
      if (targetRoom && targetRoom.participants <= 1) {
        console.log(
          `Last participant ${username} left room ${room}, terminating room`
        );
        await this.livekitService.terminateRoom(room);
        res.json({ message: "Room terminated successfully" });
      } else {
        console.log(
          `Participant ${username} left room ${room}, but others remain`
        );
        res.json({ message: "Participant left, room still active" });
      }
    } catch (error) {
      console.error("Error handling participant left:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  };
}
