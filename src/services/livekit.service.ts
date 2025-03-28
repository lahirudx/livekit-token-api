import { RoomServiceClient, AccessToken } from "livekit-server-sdk";
import crypto from "crypto";

export class LiveKitService {
  private static instance: LiveKitService;
  private roomService: RoomServiceClient;
  private roomMappings: Map<string, string>;
  private roomHosts: Map<string, string>;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  private constructor() {
    this.apiKey = process.env.LIVEKIT_API_KEY!;
    this.apiSecret = process.env.LIVEKIT_API_SECRET!;
    this.roomService = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      this.apiKey,
      this.apiSecret
    );
    this.roomMappings = new Map();
    this.roomHosts = new Map();
  }

  public static getInstance(): LiveKitService {
    if (!LiveKitService.instance) {
      LiveKitService.instance = new LiveKitService();
    }
    return LiveKitService.instance;
  }

  private generateRoomId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  async createTokenAndRoom(username: string, room?: string, isHost = false) {
    let roomId = room;

    if (isHost) {
      roomId = this.generateRoomId();
      const displayName = `${username}'s stream`;
      this.roomMappings.set(roomId, displayName);
      this.roomHosts.set(roomId, username);

      await this.roomService.createRoom({
        name: roomId,
        emptyTimeout: 10 * 60,
        maxParticipants: 20,
      });
    } else if (!roomId) {
      throw new Error("Room ID is required for non-host users");
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: username,
    });

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return {
      token: jwt,
      room: roomId,
      displayName: this.roomMappings.get(roomId),
      isHost: username === this.roomHosts.get(roomId),
    };
  }

  async terminateRoom(roomName: string) {
    try {
      await this.roomService.deleteRoom(roomName);
      return { success: true };
    } catch (error) {
      throw new Error("Failed to delete room");
    }
  }
}
