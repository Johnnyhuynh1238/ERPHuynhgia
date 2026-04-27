import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminEvaluationCriteriaClient } from "./_components/admin-evaluation-criteria-client";

export default async function AdminEvaluationCriteriaPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!["admin", "construction_manager"].includes(user.role || "")) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <AdminEvaluationCriteriaClient canWrite={["admin", "construction_manager"].includes(user.role || "")} />
    </ProtectedLayout>
  );
}
