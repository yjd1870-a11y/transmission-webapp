const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
const bucket = String(process.env.R2_BUCKET || "").trim();
const endpoint = String(process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`).trim();

let sdkPromise;
let clientPromise;

export function r2Configured() {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

export function r2ConfigurationComplete() {
  const configured = [accountId, accessKeyId, secretAccessKey, bucket].filter(Boolean).length;
  return configured === 0 || configured === 4;
}

async function sdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/s3-request-presigner"),
    ]).then(([s3, presigner]) => ({ ...s3, ...presigner }));
  }
  return sdkPromise;
}

async function r2Client() {
  if (!r2Configured()) throw new Error("R2 is not configured.");
  if (!clientPromise) {
    clientPromise = sdk().then(({ S3Client }) => new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }));
  }
  return clientPromise;
}

export async function signedPhotoUploadUrl({ objectKey, contentType, expiresIn = 300 }) {
  const [{ PutObjectCommand, getSignedUrl }, client] = await Promise.all([sdk(), r2Client()]);
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  }), { expiresIn });
  return { url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

export async function signedPhotoDownloadUrl({ objectKey, expiresIn = 600 }) {
  const [{ GetObjectCommand, getSignedUrl }, client] = await Promise.all([sdk(), r2Client()]);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn });
}

export async function inspectPhotoObject(objectKey) {
  const [{ HeadObjectCommand }, client] = await Promise.all([sdk(), r2Client()]);
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  return {
    sizeBytes: Number(result.ContentLength || 0),
    contentType: String(result.ContentType || ""),
    etag: String(result.ETag || ""),
  };
}

export async function deletePhotoObject(objectKey) {
  if (!objectKey) return;
  const [{ DeleteObjectCommand }, client] = await Promise.all([sdk(), r2Client()]);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function configurePhotoBucketCors(origins) {
  const allowedOrigins = origins.map((origin) => origin.trim()).filter(Boolean);
  if (!allowedOrigins.length) throw new Error("At least one R2 CORS origin is required.");
  const [{ PutBucketCorsCommand }, client] = await Promise.all([sdk(), r2Client()]);
  await client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["PUT"],
        AllowedHeaders: ["Content-Type"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      }],
    },
  }));
}
