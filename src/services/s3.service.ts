import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "../env";
import { Readable } from "stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export class S3Service {
  static async uploadRecording(bucket: string, key: string, body: Buffer) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
        })
      );
      return true;
    } catch (error) {
      console.error("Failed to upload recording to S3:", error);
      throw error;
    }
  }

  static async getObjectStream(key: string) {
    try {
      console.log("Getting object stream from S3:", {
        bucket: env.S3_BUCKET,
        key,
      });
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
        })
      );
      console.log("S3 response received:", {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      });

      const stream = response.Body as Readable;

      // Log stream events
      stream.on("data", (chunk) => {
        console.log(`Streaming chunk of size: ${chunk.length} bytes`);
      });

      stream.on("end", () => {
        console.log("S3 stream ended");
      });

      stream.on("error", (error) => {
        console.error("S3 stream error:", error);
      });

      return stream;
    } catch (error: any) {
      console.error("Failed to get object stream from S3:", {
        error: error.message,
        code: error.Code,
        bucket: env.S3_BUCKET,
        key,
      });
      throw error;
    }
  }

  static async getPresignedUrl(s3Key: string): Promise<string> {
    try {
      console.log("Generating presigned URL for:", {
        bucket: env.S3_BUCKET,
        key: s3Key,
      });

      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      console.log("Presigned URL generated successfully");
      return url;
    } catch (error) {
      console.error("Failed to generate presigned URL:", error);
      throw error;
    }
  }
}
