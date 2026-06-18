import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { TptcDashboardClient } from "./_components/tptc-dashboard-client";

export const dynamic = "force-dynamic";

export default async function TptcDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "construction_manager" && user.role !== "admin") {
    redirect("/?denied=tptc-dashboard");
  }

  return (
    <ProtectedLayout>
      <TptcDashboardClient />
    </ProtectedLayout>
  );
}
