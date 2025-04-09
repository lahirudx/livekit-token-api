import { EgressClient, EncodedOutputs } from "livekit-server-sdk";
import { env } from "../env";

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

    for (const participant of participants) {
      const filePath = `recordings/${roomId}/${participant}-${timestamp}.mp4`; // Unique per participant
      console.log(`[Recording] Will save ${participant} to ${filePath}`);

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
      } catch (error) {
        console.error(
          `[Recording] Error stopping egress ${egressId}:`,
          error.message
        );
      }
    }

    this.activeRecordings.delete(roomId);
    console.log(`[Recording] Recording stopped and removed for ${roomId}`);
  }

  public hasActiveRecording(roomId: string): boolean {
    return this.activeRecordings.has(roomId);
  }
}
