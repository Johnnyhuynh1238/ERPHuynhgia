import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AdminMenuClient } from "./_components/admin-menu-client";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  // Badge số việc tiền chờ admin duyệt trên icon menu Tài chính
  const [ktExpensePending, ktReceiptPending] = await Promise.all([
    prisma.expense.count({ where: { status: "tptc_pending", creator: { role: UserRole.accountant } } }),
    prisma.receipt.count({ where: { status: "awaiting_approval" } }),
  ]);

  return (
    <ProtectedLayout>
      <AdminMenuClient
        badges={{
          "/expenses": ktExpensePending,
          "/receipts": ktReceiptPending,
        }}
      />
    </ProtectedLayout>
  );
}
