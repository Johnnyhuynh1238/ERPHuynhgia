import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { PettyCashApprovalClient } from "./_components/petty-cash-approval-client";

export const dynamic = "force-dynamic";

export default async function TptcPettyCashPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "construction_manager" && user.role !== "admin") {
    redirect("/?denied=tptc-petty-cash");
  }

  return (
    <ProtectedLayout>
      <PettyCashApprovalClient />
    </ProtectedLayout>
  );
}
