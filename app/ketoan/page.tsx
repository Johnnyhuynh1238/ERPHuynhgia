import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { KetoanLauncher } from "./_components/launcher";

export const dynamic = "force-dynamic";

export default async function KetoanPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin && user.role !== UserRole.accountant) {
    redirect("/?denied=ketoan");
  }

  return (
    <ProtectedLayout>
      <KetoanLauncher />
    </ProtectedLayout>
  );
}
