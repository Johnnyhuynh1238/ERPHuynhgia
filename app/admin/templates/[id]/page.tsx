import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { TemplateEditorClient } from "../_components/template-editor-client";

export default async function AdminTemplateDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <TemplateEditorClient templateId={params.id} />
    </ProtectedLayout>
  );
}
