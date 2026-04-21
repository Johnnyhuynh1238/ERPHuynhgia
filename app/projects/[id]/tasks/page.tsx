import { ProjectTasksClient } from "./_components/project-tasks-client";

export default function ProjectTasksPage({ params }: { params: { id: string } }) {
  return <ProjectTasksClient projectId={params.id} />;
}
