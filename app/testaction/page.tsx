import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { TestActionsClient } from "./TestActionsClient";

export const dynamic = "force-dynamic";

export default async function TestActionPage() {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=testaction");

  return <TestActionsClient />;
}
