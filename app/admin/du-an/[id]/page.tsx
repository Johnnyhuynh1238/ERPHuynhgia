import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { loadPipelineState } from "@/lib/pipeline-server";
import { StageClient } from "./_components/stage-client";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Màn dự án theo giai đoạn (admin). ?gd=n mở sẵn giai đoạn n để xem lại.
export default async function DuAnStagePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { gd?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");
  if (!UUID_RE.test(params.id)) notFound();

  const p = await loadPipelineState(params.id);
  if (!p) notFound();

  const gd = Number(searchParams?.gd);
  const initialView =
    Number.isInteger(gd) && gd >= 1 && gd <= p.stage ? gd : p.stage;

  return (
    <ProtectedLayout>
      <StageClient initialView={initialView} pipeline={p} />
    </ProtectedLayout>
  );
}
