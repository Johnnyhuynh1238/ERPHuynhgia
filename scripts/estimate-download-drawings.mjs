// Tải toàn bộ bản vẽ của 1 estimate_item từ minio về /tmp/estimate-drawings/<itemId>/
// để AI worker Read được ảnh. Tự lấy credentials từ container — không cần env.
// Chạy: node scripts/estimate-download-drawings.mjs <itemId>
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const itemId = process.argv[2];
if (!itemId || !/^[0-9a-f-]{36}$/.test(itemId)) {
  console.error("Usage: node scripts/estimate-download-drawings.mjs <itemId (uuid)>");
  process.exit(1);
}

const containerEnv = (container, name) =>
  execSync(`docker exec ${container} printenv ${name}`).toString().trim();

const pgPassword = containerEnv("erp_db_prod", "POSTGRES_PASSWORD");
process.env.DATABASE_URL = `postgresql://erp_user:${pgPassword}@localhost:5433/erp_huynhgia6_prod?schema=public`;

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("SELECT name, drawings FROM estimate_items WHERE id = $1", [itemId]);
await pool.end();

if (!rows.length) {
  console.error(`Không tìm thấy estimate_item ${itemId}`);
  process.exit(1);
}
const drawings = rows[0].drawings ?? [];
if (!drawings.length) {
  console.log("(hạng mục không có bản vẽ đính kèm)");
  process.exit(0);
}

const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
const s3 = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: containerEnv("erp_app_prod", "MINIO_ACCESS_KEY"),
    secretAccessKey: containerEnv("erp_app_prod", "MINIO_SECRET_KEY"),
  },
});
const bucket = containerEnv("erp_app_prod", "MINIO_BUCKET");

const outDir = `/tmp/estimate-drawings/${itemId}`;
mkdirSync(outDir, { recursive: true });

for (let i = 0; i < drawings.length; i++) {
  const d = drawings[i];
  const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: d.key }));
  const buf = Buffer.concat(await got.Body.toArray());
  const safeName = (d.name || path.basename(d.key)).replace(/[^\w.-]/g, "_");
  const file = path.join(outDir, `${i}-${safeName}`);
  writeFileSync(file, buf);
  console.log(file);
}
