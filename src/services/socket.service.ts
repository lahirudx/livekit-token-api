import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { LiveKitService } from "./livekit.service";

export class SocketService {
  private static instance: SocketService;
  private io: Server;
  private livekitService: LiveKitService;
  private roomParticipants: Map<string, Set<string>>;
  private roomSources: Map<string, string>;

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
            }

            console.log(
              `[SocketService] Setting ${username} as source for room ${roomId}`
            );
            this.roomSources.set(roomId, username);
            console.log(
              `[SocketService] Current room sources:`,
              Object.fromEntries(this.roomSources.entries())
            );
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
            console.log(`[SocketService] Room ${roomId} cleanup complete`);
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
      });
    });
  }

  private startCleanupInterval() {
    // Run cleanup every 1 minute
    setInterval(async () => {
      try {
        await this.livekitService.cleanupStaleRooms();
      } catch (error) {
        console.error("Failed to run room cleanup:", error);
      }
    }, 1 * 60 * 1000);
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
