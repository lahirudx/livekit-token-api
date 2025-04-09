import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { RecordingService } from "./recording.service";

export class SocketService {
  private static instance: SocketService;
  private io: Server;
  private roomParticipants: Map<string, Set<string>>;
  private roomSources: Map<string, string>;
  private sourceLocations: Map<string, { latitude: number; longitude: number }>;
  private recordingService: RecordingService;
  private activeRecordings: Map<string, string>;
  private rooms: Map<string, { participants: string[] }>;

  private constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    this.recordingService = RecordingService.getInstance();
    this.roomParticipants = new Map();
    this.roomSources = new Map();
    this.sourceLocations = new Map();
    this.activeRecordings = new Map();
    this.rooms = new Map();
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
            `[SocketService] Sending initial source locations to NEWLY CONNECTED socket ${socket.id}:`,
            currentSources
          );
          socket.emit("source-location-update", currentSources);
        }
      } catch (error) {
        console.error(
          `[SocketService] Error sending initial sources to ${socket.id}:`,
          error
        );
      }

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

          socket.data.username = username;
          socket.join(roomId);

          if (!this.roomParticipants.has(roomId)) {
            this.roomParticipants.set(roomId, new Set());
          }
          this.roomParticipants.get(roomId)?.add(username);

          if (isSource) {
            const existingRoomId = this.findExistingRoomForUser(username);
            if (existingRoomId && existingRoomId !== roomId) {
              this.io.to(existingRoomId).emit("source-left", {
                message: "Source has left the room",
                forceDisconnect: true,
              });

              await new Promise((resolve) => setTimeout(resolve, 100));

              this.roomParticipants.delete(existingRoomId);
              this.roomSources.delete(existingRoomId);
              this.sourceLocations.delete(username);
            }

            this.roomSources.set(roomId, username);
          }

          socket.to(roomId).emit("participant-joined", { username });
          const participants = Array.from(
            this.roomParticipants.get(roomId) || []
          );
          socket.emit("room-participants", { participants });
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
          this.sourceLocations.set(username, location);

          const updateData = {
            username,
            location,
            roomId,
          };
          this.io.emit("source-location-update", updateData);
        }
      );

      socket.on(
        "leave-room",
        async (data: { roomId: string; username: string }) => {
          const { roomId, username } = data;
          socket.leave(roomId);

          const source = this.roomSources.get(roomId);
          const isSource = source === username;

          if (isSource) {
            const participants = this.roomParticipants.get(roomId);
            if (participants) {
              this.io.to(roomId).emit("source-left", {
                message: "Source has left the room",
                forceDisconnect: true,
                username: username,
              });

              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            this.roomParticipants.delete(roomId);
            this.roomSources.delete(roomId);
            this.sourceLocations.delete(username);
            this.io.emit("source-left", { username: username });
          } else {
            const participants = this.roomParticipants.get(roomId);
            if (participants) {
              participants.delete(username);

              if (participants.size === 0) {
                this.roomParticipants.delete(roomId);
                this.roomSources.delete(roomId);
              } else {
                socket.to(roomId).emit("participant-left", { username });
              }
            }
          }
        }
      );

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
      });

      socket.on(
        "start-recording",
        async ({ roomId, username }: { roomId: string; username: string }) => {
          console.log(
            `[Recording] Start recording requested for room ${roomId} by ${username}`
          );

          try {
            if (!this.isSourceUser(socket)) {
              console.log(
                `[Recording] User ${username} is not the source for room ${roomId}`
              );
              socket.emit("recording-error", {
                error: "Only source users can start recording",
              });
              return;
            }

            const participants = this.roomParticipants.get(roomId);
            if (!participants) {
              console.log(
                `[Recording] No participants found in room ${roomId}`
              );
              socket.emit("recording-error", {
                error: "No participants found in room",
              });
              return;
            }

            await this.recordingService.startRecording(roomId, participants);
            socket.emit("recording-started");
            this.io.to(roomId).emit("recording-started");
          } catch (error: any) {
            console.error(`[Recording] Error:`, error.message);
            socket.emit("recording-error", { error: error.message });
          }
        }
      );

      socket.on("stop-recording", async ({ roomId }: { roomId: string }) => {
        console.log(`[Recording] Stop recording requested for room ${roomId}`);

        try {
          if (!this.isSourceUser(socket)) {
            console.log(
              `[Recording] User ${socket.data.username} is not the source for room ${roomId}`
            );
            socket.emit("recording-error", {
              error: "Only source users can stop recording",
            });
            return;
          }

          await this.recordingService.stopRecording(roomId);
          socket.emit("recording-stopped");
          this.io.to(roomId).emit("recording-stopped");
        } catch (error: any) {
          console.error(`[Recording] Error:`, error.message);
          socket.emit("recording-error", { error: error.message });
        }
      });
    });
  }

  private startCleanupInterval() {
    setInterval(async () => {
      try {
        console.log("[SocketService] Running scheduled room cleanup");
        await this.checkForStaleRooms();
      } catch (error: any) {
        console.error("[SocketService] Failed to run room cleanup:", error);
      }
    }, 1 * 60 * 1000);
  }

  private async checkForStaleRooms() {
    try {
      console.log("[SocketService] Checking for stale rooms...");
      for (const [roomId, participants] of this.roomParticipants.entries()) {
        if (participants.size === 0) {
          console.log(
            `[SocketService] Found empty room ${roomId}, cleaning up`
          );
          this.roomParticipants.delete(roomId);
          this.roomSources.delete(roomId);
        }
      }

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
    } catch (error: any) {
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

  private isSourceUser(socket: Socket): boolean {
    const rooms = Array.from(socket.rooms).filter((room) => room !== socket.id);
    if (rooms.length === 0) return false;

    const roomId = rooms[0];
    console.log(
      `[SocketService] Checking source status for ${socket.data.username} in room ${roomId}`
    );
    console.log(
      `[SocketService] Room sources:`,
      Object.fromEntries(this.roomSources.entries())
    );

    return this.roomSources.get(roomId) === socket.data.username;
  }

  async handleStartRecording(
    socket: Socket,
    data: { roomId: string; username: string }
  ) {
    try {
      if (!this.isSourceUser(socket)) {
        socket.emit("recording-error", {
          error: "Only source user can start recording",
        });
        return;
      }

      if (this.activeRecordings.has(data.roomId)) {
        socket.emit("recording-error", {
          error: "Recording already in progress",
        });
        return;
      }

      // Create recording session in database
      const session = await RecordingService.createRecordingSession(
        data.roomId,
        data.username
      );

      // Start recording for each participant
      const room = this.rooms.get(data.roomId);
      if (room) {
        for (const participantId of room.participants) {
          const recording = await RecordingService.addRecording(
            session.id,
            participantId,
            `recordings/${data.roomId}/${participantId}/${Date.now()}.mp4`
          );

          // Start recording for this participant
          // ... existing recording logic ...
        }
      }

      this.activeRecordings.set(data.roomId, session.id);
      socket.emit("recording-started");
    } catch (error) {
      console.error("Failed to start recording:", error);
      socket.emit("recording-error", { error: "Failed to start recording" });
    }
  }

  async handleStopRecording(
    socket: Socket,
    data: { roomId: string; username: string }
  ) {
    try {
      if (!this.isSourceUser(socket)) {
        socket.emit("recording-error", {
          error: "Only source user can stop recording",
        });
        return;
      }

      const sessionId = this.activeRecordings.get(data.roomId);
      if (!sessionId) {
        socket.emit("recording-error", { error: "No active recording found" });
        return;
      }

      // Stop recording for each participant
      const room = this.rooms.get(data.roomId);
      if (room) {
        for (const participantId of room.participants) {
          // Stop recording for this participant
          // ... existing recording stop logic ...

          // Update recording status in database
          await RecordingService.updateRecordingStatus(
            sessionId,
            "COMPLETED",
            0, // duration
            0 // size
          );
        }
      }

      // End recording session
      await RecordingService.endRecordingSession(sessionId);
      this.activeRecordings.delete(data.roomId);
      socket.emit("recording-stopped");
    } catch (error) {
      console.error("Failed to stop recording:", error);
      socket.emit("recording-error", { error: "Failed to stop recording" });
    }
  }
}
