import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { TemplateQcEditorClient } from "../../_components/template-qc-editor-client";

export default async function AdminTemplateQcPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <TemplateQcEditorClient templateId={params.id} />
    </ProtectedLayout>
  );
}
