"use client";

import { ProjectEditorForm } from "@/app/projects/_components/project-editor-form";

export function ProjectsNewForm({
  currentUserId,
  currentUserRole,
  currentUserName,
  initialDraftId,
}: {
  currentUserId: string;
  currentUserRole: "admin" | "construction_manager";
  currentUserName: string;
  initialDraftId?: string;
}) {
  return (
    <ProjectEditorForm
      mode="create"
      initialDraftId={initialDraftId}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
    />
  );
}
