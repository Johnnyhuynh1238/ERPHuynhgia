import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { diaryGet, diaryPost, ensureKsProject } from "@/lib/ks-diary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Logic ở lib/ks-diary.ts (dùng chung với link ngày /ks-nk/[code]).
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  return diaryGet(req, project, { id: user.id });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "unauthorized" }, { status: 401 });

  const project = await ensureKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  return diaryPost(req, project, { id: user.id });
}
