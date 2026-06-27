import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ReceiptsClient } from "./_components/receipts-client";

export default async function ReceiptsPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=receipts");
  }

  const projects = await prisma.project.findMany({
    orderBy: [{ status: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  return (
    <ProtectedLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-emerald-300">Lệnh thu</h1>
          <p className="text-sm text-[#8b95b7]">
            Admin tạo lệnh thu (thu từ khách, vay, hoàn ứng, khác). Khi KT xác nhận đã thu sẽ cộng vào số dư công ty trong sổ quỹ.
          </p>
        </div>
        <ReceiptsClient role={user.role} projects={projects} />
      </div>
    </ProtectedLayout>
  );
}
