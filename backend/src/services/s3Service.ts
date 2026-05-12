import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const hasS3 = Boolean(config.AWS_S3_BUCKET && config.AWS_ACCESS_KEY_ID);

const s3 = hasS3
  ? new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
    })
  : null;

export async function getResumeUploadPresignedUrl(params: {
  key: string;
  contentType: string;
  maxSizeBytes: number;
}) {
  if (!s3 || !config.AWS_S3_BUCKET) {
    logger.warn("S3 not configured; returning dev placeholder URL");
    return {
      uploadUrl: `${config.FRONTEND_URL}/api/dev-upload-not-configured`,
      key: params.key,
      devMode: true,
    };
  }
  const command = new PutObjectCommand({
    Bucket: config.AWS_S3_BUCKET,
    Key: params.key,
    ContentType: params.contentType,
    Metadata: { maxsize: String(params.maxSizeBytes) },
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return { uploadUrl, key: params.key, devMode: false };
}

export async function getResumeDownloadUrl(key: string) {
  if (!s3 || !config.AWS_S3_BUCKET) {
    return { url: null as string | null };
  }
  const command = new GetObjectCommand({ Bucket: config.AWS_S3_BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn: 900 });
  return { url };
}
