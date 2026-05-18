import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canViewReportsHub } from "@/lib/reports-v2";
import { ReportsHubClient } from "@/app/reports/_components/reports-hub-client";
import { PushToggle } from "@/components/push-toggle";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  if (!canViewReportsHub(user.role)) {
    redirect("/");
  }

  const showPushToggle = user.role === UserRole.engineer;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      {showPushToggle ? <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} /> : null}
      <ReportsHubClient />
    </main>
  );
}
