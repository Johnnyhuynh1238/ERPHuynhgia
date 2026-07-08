// Smoke test Dự toán AI Đợt 2: CRUD estimate group/item + qaThread + minio put/get/delete.
// Chạy: DATABASE_URL=... MINIO_ENDPOINT=... node scripts/smoke-estimate.mjs
import { config } from "dotenv";
config({ path: ".env.production", override: false });

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { Pool } = await import("pg");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let failed = false;
async function check(name, fn) {
  try {
    const out = await fn();
    console.log(`PASS: ${name}${out ? " — " + out : ""}`);
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    failed = true;
  }
}

const project = await prisma.project.findFirst({ select: { id: true, code: true } });
if (!project) {
  console.log("FAIL: không có project nào trong DB");
  process.exit(1);
}

let groupId, itemId;

await check("tạo group", async () => {
  const g = await prisma.estimateGroup.create({
    data: { projectId: project.id, name: "SMOKE-TEST-GROUP", sortOrder: 9999 },
  });
  groupId = g.id;
  return g.id;
});

await check("tạo item + 3 cột mô tả", async () => {
  const it = await prisma.estimateItem.create({
    data: {
      groupId,
      name: "SMOKE móng đơn",
      method: "Đào máy, bê tông lót đá 4x6",
      materialSpec: "BT đá 1x2 M250",
      dimensions: "8 hố 1.2x1.2x0.3m",
      sortOrder: 0,
    },
  });
  itemId = it.id;
  return it.id;
});

await check("status flow draft→requested→analyzing", async () => {
  await prisma.estimateItem.update({ where: { id: itemId }, data: { status: "requested" } });
  await prisma.estimateItem.update({ where: { id: itemId }, data: { status: "analyzing" } });
  const it = await prisma.estimateItem.findUnique({ where: { id: itemId }, select: { status: true } });
  if (it.status !== "analyzing") throw new Error(`status = ${it.status}`);
});

await check("qaThread ghi + đọc", async () => {
  const thread = [{ q: "Cao độ đáy móng?", askedAt: new Date().toISOString() }];
  await prisma.estimateItem.update({ where: { id: itemId }, data: { qaThread: thread, status: "waiting_answer" } });
  const it = await prisma.estimateItem.findUnique({ where: { id: itemId }, select: { qaThread: true } });
  if (it.qaThread[0]?.q !== "Cao độ đáy móng?") throw new Error("qaThread không khớp");
});

await check("tạo line map norm thật", async () => {
  const norm = await prisma.norm.findFirst({ where: { retiredAt: null }, select: { code: true, unit: true } });
  const line = await prisma.estimateLine.create({
    data: {
      itemId,
      normCode: norm?.code ?? null,
      name: "SMOKE bê tông móng",
      unit: norm?.unit ?? "m³",
      formula: "(1.2×1.2×0.3)×8 = 3.456",
      quantity: 3.456,
    },
  });
  return `norm=${norm?.code} line=${line.id.slice(0, 8)}`;
});

await check("cascade delete group xoá hết item+line", async () => {
  await prisma.estimateGroup.delete({ where: { id: groupId } });
  const count = await prisma.estimateItem.count({ where: { id: itemId } });
  if (count !== 0) throw new Error("item còn sau khi xoá group");
});

// Minio put/get/delete đúng key pattern của upload route
await check("minio put/get/delete", async () => {
  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY },
  });
  const Bucket = process.env.MINIO_BUCKET;
  const Key = `estimate/${project.id}/smoke-${Date.now()}.jpg`;
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: Buffer.from("smoke"), ContentType: "image/jpeg" }));
  const got = await s3.send(new GetObjectCommand({ Bucket, Key }));
  const body = Buffer.concat(await got.Body.toArray()).toString();
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  if (body !== "smoke") throw new Error("nội dung không khớp");
  return Key;
});

await prisma.$disconnect();
await pool.end();
process.exit(failed ? 1 : 0);
