import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import {
  canCloseWeek,
  canExportBankCsv,
  canMarkPayrollPaid,
  canMarkPayrollReady,
  canViewPayroll,
} from "@/lib/weekly-payroll";
import { PayrollClient } from "./_components/payroll-client";

export const metadata = { title: "Lương tuần" };

export default async function PayrollPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (!canViewPayroll({ id: user.id, role: user.role })) {
    redirect(`/projects/${params.id}?denied=payroll`);
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, code: true, name: true },
  });

  if (!project) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) notFound();
    redirect("/projects?denied=1");
  }

  const ctx = { id: user.id, role: user.role };
  return (
    <PayrollClient
      projectId={project.id}
      canClose={canCloseWeek(ctx)}
      canReady={canMarkPayrollReady(ctx)}
      canMarkPaid={canMarkPayrollPaid(ctx)}
      canExport={canExportBankCsv(ctx)}
    />
  );
}
