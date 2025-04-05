import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { LiveKitService } from "./livekit.service";

export class SocketService {
  private static instance: SocketService;
  private io: Server;
  private livekitService: LiveKitService;
  private roomParticipants: Map<string, Set<string>>;
  private roomSources: Map<string, string>;
  private sourceLocations: Map<string, { latitude: number; longitude: number }>;

  private constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    this.livekitService = LiveKitService.getInstance();
    this.roomParticipants = new Map();
    this.roomSources = new Map();
    this.sourceLocations = new Map();
    this.setupSocketHandlers();
    this.startCleanupInterval();
  }

  public static getInstance(server?: HttpServer): SocketService {
    if (!SocketService.instance && server) {
      SocketService.instance = new SocketService(server);
    }
    return SocketService.instance;
  }

  private setupSocketHandlers() {
    this.io.on("connection", (socket: Socket) => {
      console.log("Client connected:", socket.id);

      // --- Send initial source locations immediately on connection ---
      try {
        // Create a reverse map for efficient lookup: username -> roomId
        const sourceUserToRoomId = new Map<string, string>();
        for (const [roomId, sourceUser] of this.roomSources.entries()) {
          sourceUserToRoomId.set(sourceUser, roomId);
        }

        const currentSources = Array.from(this.sourceLocations.entries())
          // We don't know the username yet, so we send all sources
          .map(([sourceUsername, location]) => {
            const roomId = sourceUserToRoomId.get(sourceUsername);
            return {
              username: sourceUsername,
              location,
              roomId: roomId,
            };
          })
          .filter((source) => source.roomId !== undefined); // Ensure we found a room

        if (currentSources.length > 0) {
          console.log(
            `[SocketService] Sending initial source locations to NEWLY CONNECTED socket ${socket.id}:`,
            currentSources
          );
          // Emit directly to the newly connected socket
          socket.emit("source-location-update", currentSources);
        } else {
          console.log(
            `[SocketService] No active sources to send to newly connected socket ${socket.id}`
          );
        }
      } catch (error) {
        console.error(
          `[SocketService] Error sending initial sources to ${socket.id}:`,
          error
        );
      }
      // --------------------------------------------------------------

      socket.on(
        "join-room",
        async (data: {
          roomId: string;
          username: string;
          isSource: boolean;
        }) => {
          const { roomId, username, isSource } = data;
          console.log(
            `[SocketService] User ${username} joining room ${roomId} as ${
              isSource ? "source" : "participant"
            }`
          );

          // Join socket room
          socket.join(roomId);
          console.log(
            `[SocketService] Socket ${socket.id} joined room ${roomId}`
          );

          // Update room participants
          if (!this.roomParticipants.has(roomId)) {
            console.log(
              `[SocketService] Creating new participant set for room ${roomId}`
            );
            this.roomParticipants.set(roomId, new Set());
          }
          this.roomParticipants.get(roomId)?.add(username);
          console.log(
            `[SocketService] Current participants in room ${roomId}:`,
            Array.from(this.roomParticipants.get(roomId) || [])
          );

          // If user is source, store the source information
          if (isSource) {
            console.log(
              `[SocketService] Processing join-room for SOURCE user: ${username}`
            ); // Log source processing start
            // Check if this user is already a source in another room
            const existingRoomId = this.findExistingRoomForUser(username);
            if (existingRoomId && existingRoomId !== roomId) {
              console.log(
                `[SocketService] User ${username} was already source for room ${existingRoomId}, now joining room ${roomId}`
              );

              // Notify participants in the old room
              this.io.to(existingRoomId).emit("source-left", {
                message: "Source has left the room",
                forceDisconnect: true,
              });

              // Give a small delay for clients to process
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Clean up old room state
              this.roomParticipants.delete(existingRoomId);
              this.roomSources.delete(existingRoomId);
              this.sourceLocations.delete(username);
            }

            console.log(
              `[SocketService] Setting ${username} as source for room ${roomId}`
            );
            this.roomSources.set(roomId, username);

            // Don't initialize with fake coordinates, just log the current state
            console.log(
              `[SocketService] Updated roomSources map:`,
              Object.fromEntries(this.roomSources.entries())
            );
            console.log(
              `[SocketService] Current sourceLocations map:`,
              Object.fromEntries(this.sourceLocations.entries())
            );

            // Don't broadcast anything until we have real location data
          }

          // Notify others in the room
          socket.to(roomId).emit("participant-joined", { username });
          console.log(
            `[SocketService] Notified room ${roomId} about new participant ${username}`
          );

          // Send current participants to the new user
          const participants = Array.from(
            this.roomParticipants.get(roomId) || []
          );
          socket.emit("room-participants", { participants });
          console.log(
            `[SocketService] Sent participant list to ${username}:`,
            participants
          );
        }
      );

      socket.on(
        "update-location",
        (data: {
          roomId: string;
          username: string;
          location: { latitude: number; longitude: number };
        }) => {
          const { roomId, username, location } = data;
          console.log(
            `[SocketService] Received update-location for ${username} in room ${roomId}:`,
            location
          );

          // Store the location
          this.sourceLocations.set(username, location);
          console.log(
            `[SocketService] Stored location for ${username}. Current sources:`,
            Array.from(this.sourceLocations.keys())
          ); // Log current sources

          // Broadcast to all clients, now including the roomId
          const updateData = {
            username,
            location,
            roomId,
          };
          console.log(
            `[SocketService] Broadcasting source-location-update:`,
            updateData
          ); // Log broadcast data
          this.io.emit("source-location-update", updateData);
        }
      );

      socket.on(
        "leave-room",
        async (data: { roomId: string; username: string }) => {
          const { roomId, username } = data;
          console.log(
            `[SocketService] User ${username} leaving room ${roomId}`
          );

          // Leave socket room
          socket.leave(roomId);
          console.log(
            `[SocketService] Socket ${socket.id} left room ${roomId}`
          );

          // Check if the leaving user is the source
          const source = this.roomSources.get(roomId);
          const isSource = source === username;
          console.log(
            `[SocketService] Is leaving user source? ${isSource} (room source: ${source})`
          );

          if (isSource) {
            console.log(
              `[SocketService] Source left, force closing room ${roomId}...`
            );

            // Force disconnect all participants first
            const participants = this.roomParticipants.get(roomId);
            if (participants) {
              console.log(
                `[SocketService] Notifying ${participants.size} participants about source leaving`
              );
              // Notify all participants immediately to force disconnect
              this.io.to(roomId).emit("source-left", {
                message: "Source has left the room",
                forceDisconnect: true,
                username: username,
              });

              // Give a small delay for clients to process the disconnect message
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            // Terminate the room and cleanup
            console.log(`[SocketService] Terminating room ${roomId}`);
            await this.livekitService.terminateRoom(roomId).catch((error) => {
              console.error(
                `[SocketService] Error terminating room ${roomId}:`,
                error
              );
            });

            // Always cleanup local state
            this.roomParticipants.delete(roomId);
            this.roomSources.delete(roomId);
            this.sourceLocations.delete(username);
            console.log(`[SocketService] Room ${roomId} cleanup complete`);

            // Also notify all map viewers globally that this source is gone
            this.io.emit("source-left", { username: username });
            console.log(
              `[SocketService] Broadcasted global source-left for ${username}`
            );
          } else {
            // Update room participants
            const participants = this.roomParticipants.get(roomId);
            if (participants) {
              participants.delete(username);
              console.log(
                `[SocketService] Removed ${username} from room ${roomId}`
              );
              console.log(
                `[SocketService] Remaining participants:`,
                Array.from(participants)
              );

              // If room is empty after participant left, cleanup
              if (participants.size === 0) {
                console.log(
                  `[SocketService] Room ${roomId} is empty, cleaning up`
                );
                await this.livekitService
                  .terminateRoom(roomId)
                  .catch((error) => {
                    console.error(
                      `[SocketService] Error terminating empty room ${roomId}:`,
                      error
                    );
                  });

                // Always cleanup local state
                this.roomParticipants.delete(roomId);
                this.roomSources.delete(roomId);
                console.log(
                  `[SocketService] Empty room ${roomId} cleanup complete`
                );
              } else {
                // Just notify others about participant leaving
                socket.to(roomId).emit("participant-left", { username });
                console.log(
                  `[SocketService] Notified room about participant ${username} leaving`
                );
              }
            }
          }
        }
      );

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        // Note: We might need more robust disconnect handling here later
        // to clean up if a source disconnects unexpectedly.
      });

      // Debug endpoints
      socket.on("debug-get-rooms", () => {
        try {
          console.log("[SocketService] Debug: Received request for room info");

          // Convert the room info into a serializable format
          const rooms = Array.from(this.roomParticipants.entries()).map(
            ([roomId, participants]) => {
              return {
                roomId,
                isActive: true,
                participants: Array.from(participants),
                sourceUser: this.roomSources.get(roomId),
                createdAt: new Date().toISOString(), // Mock creation time as we don't store this
              };
            }
          );

          console.log(
            `[SocketService] Debug: Sending info for ${rooms.length} rooms`
          );
          socket.emit("debug-room-info", { rooms });
        } catch (error) {
          console.error(
            "[SocketService] Debug: Error getting room info:",
            error
          );
          socket.emit("debug-room-info", { rooms: [] });
        }
      });

      socket.on("debug-cleanup-room", async (data: { roomId: string }) => {
        try {
          const { roomId } = data;
          console.log(
            `[SocketService] Debug: Force cleaning up room ${roomId}`
          );

          // Notify all participants to disconnect
          this.io.to(roomId).emit("source-left", {
            message: "Room force closed by admin",
            forceDisconnect: true,
          });

          // Wait a moment for clients to process
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Terminate the room
          await this.livekitService.terminateRoom(roomId).catch((error) => {
            console.error(
              `[SocketService] Debug: Error terminating room ${roomId}:`,
              error
            );
          });

          // Clean up local state
          const sourceUser = this.roomSources.get(roomId);
          if (sourceUser) {
            this.sourceLocations.delete(sourceUser);
          }
          this.roomParticipants.delete(roomId);
          this.roomSources.delete(roomId);

          console.log(`[SocketService] Debug: Room ${roomId} cleanup complete`);

          // Send updated room list
          const rooms = Array.from(this.roomParticipants.entries()).map(
            ([rid, participants]) => {
              return {
                roomId: rid,
                isActive: true,
                participants: Array.from(participants),
                sourceUser: this.roomSources.get(rid),
                createdAt: new Date().toISOString(),
              };
            }
          );

          socket.emit("debug-room-info", { rooms });
        } catch (error) {
          console.error(`[SocketService] Debug: Error in cleanup-room:`, error);
        }
      });
    });

    // Setup periodic broadcast of current sources
    setInterval(() => {
      try {
        // Skip if no active sources with location data
        if (this.sourceLocations.size === 0) {
          return;
        }

        // Create a reverse map for efficient lookup: username -> roomId
        const sourceUserToRoomId = new Map<string, string>();
        for (const [roomId, sourceUser] of this.roomSources.entries()) {
          sourceUserToRoomId.set(sourceUser, roomId);
        }

        // Get current sources with roomIds - ONLY include sources that have both:
        // 1. A valid location in sourceLocations
        // 2. A valid room mapping in roomSources
        const currentSources = Array.from(this.sourceLocations.entries())
          .map(([sourceUsername, location]) => {
            const roomId = sourceUserToRoomId.get(sourceUsername);
            return {
              username: sourceUsername,
              location,
              roomId: roomId,
            };
          })
          .filter((source) => source.roomId !== undefined);

        if (currentSources.length > 0) {
          console.log(
            `[SocketService] PERIODIC BROADCAST: Re-sending ${currentSources.length} source locations with real data`
          );
          // Broadcast to all connected clients
          this.io.emit("source-location-update", currentSources);
        }
      } catch (error) {
        console.error(`[SocketService] Error in periodic broadcast:`, error);
      }
    }, 10000); // Every 10 seconds
  }

  private startCleanupInterval() {
    // Run cleanup every 1 minute
    setInterval(async () => {
      try {
        console.log("[SocketService] Running scheduled room cleanup");
        // First check for any stale rooms that might have disconnected clients
        await this.checkForStaleRooms();
        // Then run the regular cleanup from livekit service
        await this.livekitService.cleanupStaleRooms();
      } catch (error) {
        console.error("[SocketService] Failed to run room cleanup:", error);
      }
    }, 1 * 60 * 1000);
  }

  // Check for any stale rooms where clients may have disconnected without proper cleanup
  private async checkForStaleRooms() {
    try {
      console.log("[SocketService] Checking for stale rooms...");
      // Get rooms from the LiveKitService
      const livekitRooms = await this.livekitService.getRooms();
      const activeLivekitRoomIds = new Set(livekitRooms.map((room) => room.id));

      // Check our tracked rooms against LiveKit's active rooms
      for (const [roomId, participants] of this.roomParticipants.entries()) {
        // If we have a room that's not in LiveKit, it's stale
        if (!activeLivekitRoomIds.has(roomId)) {
          console.log(
            `[SocketService] Found stale room ${roomId} not in LiveKit, cleaning up`
          );
          this.roomParticipants.delete(roomId);

          // If there was a source for this room, clean that up too
          const sourceUser = this.roomSources.get(roomId);
          if (sourceUser) {
            this.sourceLocations.delete(sourceUser);
            console.log(
              `[SocketService] Cleaned up source ${sourceUser} for stale room ${roomId}`
            );
          }
          this.roomSources.delete(roomId);
        }
        // If it's empty, clean it up
        else if (participants.size === 0) {
          console.log(
            `[SocketService] Found empty room ${roomId}, cleaning up`
          );
          await this.livekitService.terminateRoom(roomId).catch((error) => {
            console.error(
              `[SocketService] Error terminating empty room ${roomId}:`,
              error
            );
          });
          this.roomParticipants.delete(roomId);
          this.roomSources.delete(roomId);
        }
      }

      // Check for any sources without rooms
      for (const sourceUser of this.sourceLocations.keys()) {
        let hasRoom = false;
        for (const [_, user] of this.roomSources.entries()) {
          if (user === sourceUser) {
            hasRoom = true;
            break;
          }
        }
        if (!hasRoom) {
          console.log(
            `[SocketService] Found orphaned source ${sourceUser}, cleaning up`
          );
          this.sourceLocations.delete(sourceUser);
        }
      }

      console.log("[SocketService] Stale room check complete");
    } catch (error) {
      console.error("[SocketService] Error checking for stale rooms:", error);
    }
  }

  public getIO(): Server {
    return this.io;
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
