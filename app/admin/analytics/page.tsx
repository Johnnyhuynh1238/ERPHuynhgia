import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { currentHdtkPassword, nextRotationDate } from "@/lib/hdtk-password";
import { AnalyticsClient } from "./_components/analytics-client";

export default async function AdminAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");

  const hdtkPassword = currentHdtkPassword();
  const hdtkRotateAt = nextRotationDate().toISOString();

  return (
    <ProtectedLayout>
      <AnalyticsClient hdtkPassword={hdtkPassword} hdtkRotateAt={hdtkRotateAt} />
    </ProtectedLayout>
  );
}
