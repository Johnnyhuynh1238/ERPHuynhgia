import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function createPrisma() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL");
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

export default async function DevSmokeTestPage() {
  if (process.env.NODE_ENV === "production") {
    return <div>Route này chỉ dùng cho development.</div>;
  }

  const user = await getCurrentUser();
  const { prisma, pool } = createPrisma();

  const [users, projects, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.task.count({ where: { isActive: true } }),
  ]);

  await prisma.$disconnect();
  await pool.end();

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-orange-300">Dev Smoke Test</h1>
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div><strong>User hiện tại:</strong> {user?.name} ({user?.role})</div>
          <div><strong>Tổng users:</strong> {users}</div>
          <div><strong>Tổng projects:</strong> {projects}</div>
          <div><strong>Tổng tasks:</strong> {tasks}</div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
