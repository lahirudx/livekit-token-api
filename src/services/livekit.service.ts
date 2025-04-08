import { RoomServiceClient, AccessToken, Room } from "livekit-server-sdk";
import crypto from "crypto";
import { env } from "../env";

export class LiveKitService {
  private static instance: LiveKitService;
  private roomService: RoomServiceClient;
  private roomMappings: Map<string, string>;
  private roomSources: Map<string, string>;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  private constructor() {
    this.apiKey = env.LIVEKIT_API_KEY!;
    this.apiSecret = env.LIVEKIT_API_SECRET!;
    this.roomService = new RoomServiceClient(
      env.LIVEKIT_URL!,
      this.apiKey,
      this.apiSecret
    );
    this.roomMappings = new Map();
    this.roomSources = new Map();
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

  async createTokenAndRoom(username: string, room?: string, isSource = false) {
    console.log(
      `[LiveKitService] Creating token for user ${username}, room: ${room}, isSource: ${isSource}`
    );
    let roomId = room;

    if (isSource) {
      // Check if this user already has a room and terminate it
      const existingRoomId = this.findExistingRoomForUser(username);
      if (existingRoomId) {
        console.log(
          `[LiveKitService] User ${username} already has room ${existingRoomId}, terminating it before creating a new one`
        );
        await this.terminateRoom(existingRoomId).catch((error) => {
          console.error(
            `[LiveKitService] Error terminating existing room ${existingRoomId}:`,
            error
          );
        });
      }

      roomId = this.generateRoomId();
      const displayName = `${username}'s stream`;
      console.log(
        `[LiveKitService] Creating new room ${roomId} for source ${username}`
      );
      this.roomMappings.set(roomId, displayName);
      this.roomSources.set(roomId, username);

      await this.roomService.createRoom({
        name: roomId,
        emptyTimeout: 0, // Immediate cleanup when empty
        maxParticipants: 10,
      });
      console.log(`[LiveKitService] Room ${roomId} created successfully`);
    } else if (!roomId) {
      console.error(
        `[LiveKitService] Room ID required for non-source user ${username}`
      );
      throw new Error("Room ID is required for non-source users");
    } else {
      console.log(
        `[LiveKitService] User ${username} joining existing room ${roomId}`
      );
      const source = this.roomSources.get(roomId);
      console.log(`[LiveKitService] Room ${roomId} source is: ${source}`);
    }

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: username,
    });

    token.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true, // Allow all participants to publish
      canSubscribe: true,
    });

    const jwt = await token.toJwt();
    console.log(
      `[LiveKitService] Token created for ${username} in room ${roomId}, isSource: ${isSource}`
    );

    return {
      token: jwt,
      room: roomId,
      displayName: this.roomMappings.get(roomId),
      isSource: username === this.roomSources.get(roomId),
    };
  }

  async terminateRoom(roomName: string) {
    try {
      // First check if room exists and has no participants
      const rooms = await this.roomService.listRooms();
      const room = rooms.find((r) => r.name === roomName);

      if (room) {
        if (room.numParticipants > 0) {
          // Get participants and remove them
          const participants = await this.roomService.listParticipants(
            roomName
          );
          for (const participant of participants) {
            await this.roomService.removeParticipant(
              roomName,
              participant.identity
            );
          }
        }
        await this.roomService.deleteRoom(roomName);
      }
      // Room doesn't exist - that's fine, just cleanup our local state

      this.roomMappings.delete(roomName);
      this.roomSources.delete(roomName);
      return { success: true };
    } catch (error: any) {
      // If room not found, just cleanup local state
      if (error?.response?.status === 404) {
        this.roomMappings.delete(roomName);
        this.roomSources.delete(roomName);
        return { success: true };
      }
      console.error(`Failed to terminate room ${roomName}:`, error);
      throw new Error("Failed to delete room");
    }
  }

  async cleanupStaleRooms() {
    try {
      const rooms = await this.roomService.listRooms();

      // First, check for duplicate source rooms
      await this.cleanupDuplicateSourceRooms();

      // Then clean up empty rooms
      for (const room of rooms) {
        // If room has no participants
        if (room.numParticipants === 0) {
          await this.terminateRoom(room.name);
        }
      }
    } catch (error) {
      console.error("Failed to cleanup stale rooms:", error);
    }
  }

  async cleanupDuplicateSourceRooms() {
    // Create a map to track the latest room for each source user
    const latestRoomByUser = new Map<
      string,
      { roomId: string; timestamp: Date }
    >();

    // Get all rooms from LiveKit
    const rooms = await this.roomService.listRooms();

    // Track the latest room for each source user
    for (const [roomId, sourceUser] of this.roomSources.entries()) {
      const room = rooms.find((r) => r.name === roomId);
      if (!room) continue; // Room doesn't exist on LiveKit server

      const roomTimestamp = room.creationTime
        ? new Date(room.creationTime)
        : new Date();

      if (
        !latestRoomByUser.has(sourceUser) ||
        roomTimestamp > latestRoomByUser.get(sourceUser)!.timestamp
      ) {
        latestRoomByUser.set(sourceUser, { roomId, timestamp: roomTimestamp });
      }
    }

    // Clean up older rooms for each user
    for (const [roomId, sourceUser] of this.roomSources.entries()) {
      const latestRoom = latestRoomByUser.get(sourceUser);

      if (latestRoom && latestRoom.roomId !== roomId) {
        console.log(
          `[LiveKitService] Found duplicate room ${roomId} for user ${sourceUser}, terminating it`
        );
        await this.terminateRoom(roomId).catch((error) => {
          console.error(
            `[LiveKitService] Error terminating duplicate room ${roomId}:`,
            error
          );
        });
      }
    }

    console.log("[LiveKitService] Duplicate room cleanup completed");
  }

  async getRooms() {
    try {
      const rooms = await this.roomService.listRooms();
      return rooms.map((room) => ({
        id: room.name,
        name: this.roomMappings.get(room.name) || room.name,
        participants: room.numParticipants,
      }));
    } catch (error) {
      throw new Error("Failed to fetch rooms");
    }
  }

  async isRoomActive(roomId: string): Promise<boolean> {
    console.log(`[LiveKitService] Checking if room ${roomId} is active`);

    // First check if the room has a source in our local map
    const source = this.roomSources.get(roomId);
    if (!source) {
      console.log(
        `[LiveKitService] Room ${roomId} has no source in our records`
      );
      return false;
    }

    // Then verify with LiveKit server if the room exists
    try {
      const rooms = await this.roomService.listRooms();
      const room = rooms.find((r) => r.name === roomId);

      if (!room) {
        console.log(
          `[LiveKitService] Room ${roomId} not found on LiveKit server`
        );
        return false;
      }

      // Room exists and has a source
      console.log(
        `[LiveKitService] Room ${roomId} is active with source ${source}`
      );
      return true;
    } catch (error) {
      console.error(`[LiveKitService] Error checking room status:`, error);
      // If we can't verify, assume it's not active for safety
      return false;
    }
  }

  private findExistingRoomForUser(username: string): string | undefined {
    for (const [roomId, sourceUser] of this.roomSources.entries()) {
      if (sourceUser === username) {
        return roomId;
      }
    }
    return undefined;
  }
}
