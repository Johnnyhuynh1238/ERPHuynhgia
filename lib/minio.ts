import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function getMinioEndpoint() {
  const raw = process.env.MINIO_ENDPOINT || "";
  if (!raw) throw new Error("MINIO_ENDPOINT is missing");
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `http://${raw}`;
}

export function getMinioBucket() {
  const bucket = process.env.MINIO_BUCKET || "";
  if (!bucket) throw new Error("MINIO_BUCKET is missing");
  return bucket;
}

export function getMinioClient() {
  if (cachedClient) return cachedClient;

  const accessKeyId = process.env.MINIO_ACCESS_KEY || "";
  const secretAccessKey = process.env.MINIO_SECRET_KEY || "";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("MINIO_ACCESS_KEY or MINIO_SECRET_KEY is missing");
  }

  cachedClient = new S3Client({
    region: "us-east-1",
    endpoint: getMinioEndpoint(),
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}

export async function putObjectToMinio({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  const client = getMinioClient();
  const bucket = getMinioBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObjectFromMinio(key: string) {
  const client = getMinioClient();
  const bucket = getMinioBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((x) => Buffer.from(x)));
}

export async function getObjectFromMinio(key: string) {
  const client = getMinioClient();
  const bucket = getMinioBucket();

  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const buffer = await bodyToBuffer(result.Body);
  return {
    buffer,
    contentType: result.ContentType || "application/octet-stream",
  };
}
