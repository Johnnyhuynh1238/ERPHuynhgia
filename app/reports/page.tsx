import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getTodayDateVn } from "@/lib/task-centric";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  if (user.role === "foreman") redirect("/");

  const today = getTodayDateVn();
  const assignments = await prisma.projectMemberAssignment.findMany({
    where: { userId: user.id },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          tasks: { where: { isActive: true }, select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 space-y-4">
      <h1 className="text-lg font-semibold">Báo cáo hôm nay</h1>
      <p className="text-sm text-muted-foreground">{today.toISOString().slice(0, 10)}</p>
      {assignments.length === 0 ? <div className="text-sm">Không có dự án được phân công.</div> : null}
      {assignments.map((a) => (
        <section key={`${a.projectId}-${a.role}`} className="rounded-xl border p-3 space-y-2">
          <div className="font-medium">{a.project.code} · {a.project.name}</div>
          <div className="text-xs text-muted-foreground">Vai trò: {a.role}</div>
          <ul className="space-y-1">
            {a.project.tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <span>{t.code} - {t.name}</span>
                <Link className="text-orange-600" href={`/tasks/${t.id}`}>Vào task</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Link className="inline-flex rounded-md border px-3 py-2 text-sm" href="/reports/checkin">Check-in sáng</Link>
    </main>
  );
}
