import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Script test kết nối DB bằng Prisma Client (Prisma 7 cần adapter)
// Luồng test:
// 1) Tạo 1 user admin test
// 2) Query lại user vừa tạo
// 3) Xóa user test để trả DB về trạng thái sạch

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Thiếu DATABASE_URL trong .env");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = `admin.test.${Date.now()}@congty.vn`;

  const created = await prisma.user.create({
    data: {
      email,
      passwordHash: "bcrypt_hash_demo",
      fullName: "Admin Test",
      phone: null,
      role: UserRole.admin,
      isActive: true,
    },
  });

  console.log("[TEST-DB] Đã tạo user:", created.id, created.email);

  const found = await prisma.user.findUnique({ where: { email } });
  if (!found) {
    throw new Error("Không query lại được user vừa tạo");
  }

  console.log("[TEST-DB] Query lại thành công:", found.id, found.role);

  await prisma.user.delete({ where: { id: created.id } });
  console.log("[TEST-DB] Đã xóa user test");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error("[TEST-DB] Lỗi:", error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
