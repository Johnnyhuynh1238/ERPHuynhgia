import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { CustomerPipelineClient } from "./_components/customer-pipeline-client";

export default async function CustomerPipelinePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  return (
    <ProtectedLayout>
      <Suspense fallback={null}>
        <CustomerPipelineClient />
      </Suspense>
    </ProtectedLayout>
  );
}
