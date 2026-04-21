import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminTemplatesClient } from "./_components/admin-templates-client";

export default async function AdminTemplatesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <AdminTemplatesClient />
    </ProtectedLayout>
  );
}
