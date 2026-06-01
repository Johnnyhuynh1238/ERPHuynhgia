import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ChamCongClient } from "./_components/cham-cong-client";

export default async function ChamCongPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  if (user.role !== "engineer" && user.role !== "accountant") redirect("/");

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <ChamCongClient />
    </main>
  );
}
