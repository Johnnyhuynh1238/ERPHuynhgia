import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { parseMonthInput } from "@/lib/date";
import { getActiveKpiSettings } from "@/lib/kpi";
import { prisma } from "@/lib/prisma";
import { KpiSettingsClient } from "./_components/kpi-settings-client";

export default async function AdminKpiSettingsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin) {
    redirect("/?denied=1");
  }

  const { month } = parseMonthInput(null);
  const [active, history] = await Promise.all([
    getActiveKpiSettings(month),
    prisma.kpiSettings.findMany({
      orderBy: { effectiveFromMonth: "desc" },
      take: 20,
      include: {
        changer: {
          select: { id: true, fullName: true, email: true },
        },
      },
    }),
  ]);

  return (
    <ProtectedLayout>
      <KpiSettingsClient
        initialData={{
          month,
          active: {
            ...active,
            changedAt: active.changedAt?.toISOString() ?? null,
          },
          history: history.map((row) => ({
            id: row.id,
            weightTienDo: row.weightTienDo,
            weightQc: row.weightQc,
            weightBaoCao: row.weightBaoCao,
            weightChuNha: row.weightChuNha,
            weightDongGop: row.weightDongGop,
            effectiveFromMonth: row.effectiveFromMonth,
            changedBy: row.changedBy,
            changedAt: row.changedAt.toISOString(),
            reason: row.reason,
            changer: row.changer,
          })),
        }}
      />
    </ProtectedLayout>
  );
}
