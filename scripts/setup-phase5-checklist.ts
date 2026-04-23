import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, TaskStatus, TaskPhase, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function todayUtcDateOnly() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 0, 0, 0));
}

(async () => {
  const out: string[] = [];
  const today = todayUtcDateOnly();

  // 1) Admin tạo user role=engineer (KS test)
  const email = 'ks.phase15.test@congty.vn';
  const tempPassword = 'ChangeMe@2026';
  const hash = await bcrypt.hash(tempPassword, 12);

  const ks = await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.engineer,
      isActive: true,
      mustChangePassword: true,
      passwordHash: hash,
      fullName: 'KS Phase1.5 Test',
    },
    create: {
      email,
      fullName: 'KS Phase1.5 Test',
      role: UserRole.engineer,
      passwordHash: hash,
      isActive: true,
      mustChangePassword: true,
      phone: null,
    },
    select: { id: true, email: true, role: true, mustChangePassword: true },
  });
  out.push(`STEP1 PASS: created/updated ${ks.email} role=${ks.role} mustChange=${ks.mustChangePassword}`);

  // demo project
  const demo = await prisma.project.findFirst({ where: { code: 'DA-2026-DEMO' }, select: { id: true, code: true, goLiveDate: true } });
  if (!demo) {
    out.push('STEP2 FAIL: demo project DA-2026-DEMO not found');
  } else {
    // 2) set go_live_date
    const p2 = await prisma.project.update({
      where: { id: demo.id },
      data: { goLiveDate: today },
      select: { id: true, code: true, goLiveDate: true },
    });
    out.push(`STEP2 PASS: ${p2.code} goLiveDate=${p2.goLiveDate?.toISOString().slice(0,10)}`);

    // ensure ks is member (so dashboard/report routes meaningful)
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: demo.id, userId: ks.id } },
      update: { roleInProject: 'engineer', addedBy: ks.id },
      create: { projectId: demo.id, userId: ks.id, roleInProject: 'engineer', addedBy: ks.id },
    });

    // 3) bulk mark phase 1+2 inspected (simulate)
    const taskIds = await prisma.task.findMany({
      where: {
        projectId: demo.id,
        isActive: true,
        phase: { in: [TaskPhase.P1_CHUAN_BI, TaskPhase.P2_MONG] },
      },
      select: { id: true },
    });

    const ids = taskIds.map(t => t.id);
    if (!ids.length) {
      out.push('STEP3 FAIL: no tasks found in phase 1+2');
    } else {
      const upd = await prisma.task.updateMany({
        where: { id: { in: ids } },
        data: { status: TaskStatus.inspected, actualStartDate: today, actualEndDate: today },
      });
      out.push(`STEP3 PASS: bulk inspected ${upd.count} tasks (phase 1+2)`);
    }
  }

  // 4) login/force change/dashboard cannot be verified via DB alone
  out.push('STEP4 MANUAL: login ks.phase15.test@congty.vn / ChangeMe@2026 -> expect force-change-password then dashboard engineer');

  console.log(out.join('\n'));

  await prisma.$disconnect();
  await pool.end();
})();
