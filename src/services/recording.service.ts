import { EgressClient, EncodedOutputs } from "livekit-server-sdk";
import { env } from "../env";
import { RecordingStatus } from "@prisma/client";
import prisma from "../db";

export class RecordingService {
  private static instance: RecordingService;
  private egressClient: EgressClient;
  private activeRecordings: Map<string, string> = new Map(); // roomId -> egressIds (comma-separated)

  private constructor() {
    this.egressClient = new EgressClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET
    );
  }

  public static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }
    return RecordingService.instance;
  }

  public async startRecording(
    roomId: string,
    participants: Set<string>
  ): Promise<string> {
    console.log(`[Recording] Starting recording for room ${roomId}`);
    console.log(
      `[Recording] Current active recordings:`,
      Object.fromEntries(this.activeRecordings.entries())
    );

    if (this.activeRecordings.has(roomId)) {
      throw new Error("Recording already in progress");
    }

    const timestamp = new Date().toISOString();
    const egressIds = new Map<string, string>(); // participant -> egressId
    const recordingIds = new Map<string, string>(); // participant -> recordingId

    // Create recording session
    const session = await RecordingService.createRecordingSession(
      roomId,
      Array.from(participants)[0]
    );

    for (const participant of participants) {
      const filePath = `recordings/${roomId}/${participant}-${timestamp}.mp4`; // Unique per participant
      console.log(`[Recording] Will save ${participant} to ${filePath}`);

      // Create recording record in database
      const recording = await RecordingService.addRecording(
        session.id,
        participant,
        filePath
      );
      recordingIds.set(participant, recording.id);

      const output: EncodedOutputs = {
        file: {
          filepath: filePath,
          s3: {
            accessKey: env.AWS_ACCESS_KEY_ID,
            secret: env.AWS_SECRET_ACCESS_KEY,
            region: env.AWS_REGION,
            bucket: env.S3_BUCKET,
          },
        },
      };

      console.log(`[Recording] Starting egress for participant ${participant}`);
      const egress = await this.egressClient.startParticipantEgress(
        roomId,
        participant,
        output
      );

      if (!egress.egressId) {
        throw new Error(`Failed to get egress ID for ${participant}`);
      }

      console.log(
        `[Recording] Egress started for ${participant} with ID: ${egress.egressId}`
      );
      egressIds.set(participant, egress.egressId);

      // Store egress ID in recording record
      await prisma.recording.update({
        where: { id: recording.id },
        data: {
          s3Key: `${filePath}-${egress.egressId}`,
        },
      });
    }

    const egressIdsStr = Array.from(egressIds.values()).join(",");
    this.activeRecordings.set(roomId, egressIdsStr);
    console.log(`[Recording] Stored egress IDs: ${egressIdsStr}`);

    return egressIdsStr;
  }

  public async stopRecording(roomId: string): Promise<void> {
    console.log(`[Recording] Stopping recording for room ${roomId}`);
    const egressIdsStr = this.activeRecordings.get(roomId);

    if (!egressIdsStr) {
      throw new Error("No active recording found");
    }

    const egressIds = egressIdsStr.split(",");
    for (const egressId of egressIds) {
      try {
        await this.egressClient.stopEgress(egressId);
        console.log(`[Recording] Stopped egress ${egressId}`);

        // Update recording status in database
        const recording = await prisma.recording.findFirst({
          where: {
            s3Key: {
              endsWith: egressId,
            },
          },
        });

        if (recording) {
          await RecordingService.updateRecordingStatus(
            recording.id,
            RecordingStatus.COMPLETED
          );
          console.log(
            `[Recording] Updated recording ${recording.id} status to COMPLETED`
          );
        }
      } catch (error) {
        console.error(
          `[Recording] Error stopping egress ${egressId}:`,
          error.message
        );
      }
    }

    // Get the recording session and mark it as ended
    const session = await prisma.recordingSession.findFirst({
      where: {
        roomId,
        endedAt: null,
      },
    });

    if (session) {
      await RecordingService.endRecordingSession(session.id);
      console.log(`[Recording] Marked session ${session.id} as ended`);
    }

    this.activeRecordings.delete(roomId);
    console.log(`[Recording] Recording stopped and removed for ${roomId}`);
  }

  public hasActiveRecording(roomId: string): boolean {
    return this.activeRecordings.has(roomId);
  }

  static async createRecordingSession(roomId: string, sourceUser: string) {
    return prisma.recordingSession.create({
      data: {
        roomId,
        sourceUser,
      },
    });
  }

  static async addRecording(
    sessionId: string,
    participantId: string,
    s3Key: string
  ) {
    return prisma.recording.create({
      data: {
        sessionId,
        participantId,
        s3Key,
      },
    });
  }

  static async updateRecordingStatus(
    recordingId: string,
    status: RecordingStatus,
    duration?: number,
    size?: number
  ) {
    return prisma.recording.update({
      where: { id: recordingId },
      data: {
        status,
        duration,
        size,
      },
    });
  }

  static async endRecordingSession(sessionId: string) {
    return prisma.recordingSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
      },
    });
  }

  static async getRecordingSessions(username: string) {
    return prisma.recordingSession.findMany({
      where: {
        sourceUser: username,
      },
      include: {
        recordings: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async getRecordingSession(sessionId: string) {
    return prisma.recordingSession.findUnique({
      where: { id: sessionId },
      include: {
        recordings: true,
      },
    });
  }
}
