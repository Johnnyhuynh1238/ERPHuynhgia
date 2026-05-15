import { config } from "dotenv";
config({ path: ".env.production", override: true });

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { Pool } = await import("pg");
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");
const sharp = (await import("sharp")).default;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function check(name, fn) {
  try {
    const out = await fn();
    console.log(`PASS: ${name}${out ? " — " + out : ""}`);
    return true;
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    return false;
  }
}

async function main() {
  await check("DB connects", async () => {
    const r = await prisma.$queryRaw`SELECT 1 as ok`;
    return `1=${r[0].ok}`;
  });

  await check("design_photo_groups table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM design_photo_groups`;
    return `rows=${r[0].n}`;
  });

  await check("design_photos table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM design_photos`;
    return `rows=${r[0].n}`;
  });

  await check("design_photo_group_access table exists", async () => {
    const r = await prisma.$queryRaw`SELECT COUNT(*)::int as n FROM design_photo_group_access`;
    return `rows=${r[0].n}`;
  });

  await check("Prisma model designPhotoGroup queryable", async () => {
    const c = await prisma.designPhotoGroup.count();
    return `count=${c}`;
  });

  const endpoint = process.env.MINIO_ENDPOINT;
  const bucket = process.env.MINIO_BUCKET;
  console.log(`MinIO endpoint: ${endpoint}, bucket: ${bucket}`);

  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: endpoint.startsWith("http") ? endpoint : `http://${endpoint}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY,
    },
  });

  await check("MinIO bucket reachable", async () => {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return "ok";
  });

  const testKey = `design-photos/__smoke__/${Date.now()}.txt`;
  await check("MinIO put", async () => {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: testKey, Body: Buffer.from("smoke-test"), ContentType: "text/plain" }));
    return testKey;
  });

  await check("MinIO delete (cleanup)", async () => {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    return "ok";
  });

  await check("Sharp resize a 100x100 JPEG", async () => {
    const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
    const out = await sharp(input).resize(480, 480, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    return `out=${out.length}b`;
  });

  await prisma.$disconnect();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
