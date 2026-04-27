import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { AdminSpecialtiesClient } from "./_components/admin-specialties-client";

export default async function AdminSpecialtiesPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!["admin", "construction_manager"].includes(user.role || "")) {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <AdminSpecialtiesClient canWrite={["admin", "construction_manager"].includes(user.role || "")} />
    </ProtectedLayout>
  );
}
