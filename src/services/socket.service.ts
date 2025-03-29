import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { LiveKitService } from "./livekit.service";

export class SocketService {
  private static instance: SocketService;
  private io: Server;
  private livekitService: LiveKitService;
  private roomParticipants: Map<string, Set<string>>;

  private constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    this.livekitService = LiveKitService.getInstance();
    this.roomParticipants = new Map();
    this.setupSocketHandlers();
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
        async (data: { roomId: string; username: string }) => {
          const { roomId, username } = data;
          console.log(`User ${username} joining room ${roomId}`);

          // Join socket room
          socket.join(roomId);

          // Update room participants
          if (!this.roomParticipants.has(roomId)) {
            this.roomParticipants.set(roomId, new Set());
          }
          this.roomParticipants.get(roomId)?.add(username);

          // Notify others in the room
          socket.to(roomId).emit("participant-joined", { username });

          // Send current participants to the new user
          const participants = Array.from(
            this.roomParticipants.get(roomId) || []
          );
          socket.emit("room-participants", { participants });
        }
      );

      socket.on(
        "leave-room",
        async (data: { roomId: string; username: string }) => {
          const { roomId, username } = data;
          console.log(`User ${username} leaving room ${roomId}`);

          // Leave socket room
          socket.leave(roomId);

          // Update room participants
          const participants = this.roomParticipants.get(roomId);
          if (participants) {
            participants.delete(username);
            if (participants.size === 0) {
              this.roomParticipants.delete(roomId);
            }
          }

          // Notify others in the room
          socket.to(roomId).emit("participant-left", { username });

          // If no participants left, terminate the room
          if (this.roomParticipants.get(roomId)?.size === 0) {
            try {
              await this.livekitService.terminateRoom(roomId);
              console.log(`Room ${roomId} terminated`);
            } catch (error) {
              console.error(`Failed to terminate room ${roomId}:`, error);
            }
          }
        }
      );

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });
    });
  }

  public getIO(): Server {
    return this.io;
  }
}
