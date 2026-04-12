import { S3Client } from '@aws-sdk/client-s3';

let s3Instance: S3Client | null = null;

/**
 * Returns a singleton S3Client configured from environment variables.
 * Called by Phase 2 presigned URL generation routes.
 *
 * Required env vars (set in .env.local):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
 *
 * NOTE: Do not add file upload logic here. This file is Phase 2's entry point.
 * Phase 2 imports getS3Client() and S3_BUCKET from this module without refactoring.
 */
export function getS3Client(): S3Client {
  if (!s3Instance) {
    s3Instance = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Instance;
}

/** The S3 bucket name Phase 2 routes use for all file operations. */
export const S3_BUCKET = process.env.AWS_S3_BUCKET!;
