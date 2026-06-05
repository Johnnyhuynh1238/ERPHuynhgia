import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { LeadsClient } from "./_components/leads-client";

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  return (
    <ProtectedLayout>
      <Suspense fallback={null}>
        <LeadsClient />
      </Suspense>
    </ProtectedLayout>
  );
}
