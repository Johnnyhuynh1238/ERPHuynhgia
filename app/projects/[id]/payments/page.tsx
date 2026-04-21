import { ProjectPaymentsClient } from "./_components/project-payments-client";

export default function ProjectPaymentsPage({ params }: { params: { id: string } }) {
  return <ProjectPaymentsClient projectId={params.id} />;
}
