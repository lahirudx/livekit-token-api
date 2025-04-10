import {
  EgressClient,
  EncodedOutputs,
  DirectFileOutput,
  RoomServiceClient,
  TrackType,
} from "livekit-server-sdk";
import { env } from "../env";
import { RecordingStatus } from "@prisma/client";
import prisma from "../db";

export class RecordingService {
  private static instance: RecordingService;
  private egressClient: EgressClient;
  private roomService: RoomServiceClient;
  private activeRecordings: Map<string, string[]> = new Map(); // roomId -> egressIds array

  private constructor() {
    this.egressClient = new EgressClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET
    );
    this.roomService = new RoomServiceClient(
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
      const filePath = `recordings/${roomId}/${participant}-${timestamp}.mp4`;
      console.log(`[Recording] Will save ${participant} to ${filePath}`);

      // Create recording record in database
      const recording = await RecordingService.addRecording(
        session.id,
        participant,
        filePath
      );
      recordingIds.set(participant, recording.id);

      const output: DirectFileOutput = {
        filepath: filePath,
        s3: {
          accessKey: env.AWS_ACCESS_KEY_ID,
          secret: env.AWS_SECRET_ACCESS_KEY,
          region: env.AWS_REGION,
          bucket: env.S3_BUCKET,
        },
      };

      // Get both audio and video tracks for the participant
      const room = await this.roomService.getParticipant(roomId, participant);
      const videoTrack = room.tracks.find(
        (track) => track.type === TrackType.VIDEO
      );
      const audioTrack = room.tracks.find(
        (track) => track.type === TrackType.AUDIO
      );

      if (!videoTrack || !audioTrack) {
        throw new Error(`Missing tracks for participant ${participant}`);
      }

      // Start video track egress
      console.log(
        `[Recording] Starting video track egress for track ${videoTrack.sid}`
      );
      const videoEgress = await this.egressClient.startTrackEgress(
        roomId,
        { ...output, filepath: `${filePath}-video` },
        videoTrack.sid
      );

      if (!videoEgress.egressId) {
        throw new Error(`Failed to get video egress ID for ${participant}`);
      }

      // Start audio track egress
      console.log(
        `[Recording] Starting audio track egress for track ${audioTrack.sid}`
      );
      const audioEgress = await this.egressClient.startTrackEgress(
        roomId,
        { ...output, filepath: `${filePath}-audio` },
        audioTrack.sid
      );

      if (!audioEgress.egressId) {
        throw new Error(`Failed to get audio egress ID for ${participant}`);
      }

      // Store both egress IDs
      const egressIds = [videoEgress.egressId, audioEgress.egressId];
      const currentEgressIds = this.activeRecordings.get(roomId) || [];
      this.activeRecordings.set(roomId, [...currentEgressIds, ...egressIds]);

      // Store egress IDs in recording record
      await prisma.recording.update({
        where: { id: recording.id },
        data: {
          s3Key: filePath,
        },
      });

      console.log(`[Recording] Stored egress IDs: ${egressIds.join(",")}`);
    }

    const allEgressIds = this.activeRecordings.get(roomId) || [];
    return allEgressIds.join(",");
  }

  public async stopRecording(roomId: string): Promise<void> {
    console.log(`[Recording] Stopping recording for room ${roomId}`);
    const egressIds = this.activeRecordings.get(roomId);

    if (!egressIds || egressIds.length === 0) {
      throw new Error("No active recording found");
    }

    for (const egressId of egressIds) {
      try {
        await this.egressClient.stopEgress(egressId);
        console.log(`[Recording] Stopped egress ${egressId}`);

        // Update recording status in database
        const recording = await prisma.recording.findFirst({
          where: {
            s3Key: {
              contains: roomId,
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
