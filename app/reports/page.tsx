import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canViewReportsHub } from "@/lib/reports-v2";
import { ReportsHubClient } from "@/app/reports/_components/reports-hub-client";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  if (!canViewReportsHub(user.role)) {
    redirect("/");
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <ReportsHubClient />
    </main>
  );
}
