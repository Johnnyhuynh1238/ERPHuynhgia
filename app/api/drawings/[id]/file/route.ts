import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

function canViewDrawing(role: UserRole) {
  return role === UserRole.admin || role === UserRole.construction_manager || role === UserRole.engineer;
}

function minioKey(url: string) {
  return url.startsWith("minio://") ? url.slice("minio://".length) : null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const drawing = await prisma.projectDrawing.findUnique({ where: { id: params.id } });
  if (!drawing) return NextResponse.json({ message: "Không tìm thấy bản vẽ" }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    const access = await requireCustomerPortalApiAccess(token);
    if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });
    if (access.project.id !== drawing.projectId) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  } else {
    const user = await getCurrentUser();
    if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
    if (!canViewDrawing(user.role as UserRole)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    const project = await prisma.project.findFirst({
      where: { id: drawing.projectId, ...buildProjectAccessWhere({ id: user.id, role: user.role }) },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const key = minioKey(drawing.fileUrl);
  if (!key) return NextResponse.redirect(drawing.fileUrl);

  const file = await getObjectFromMinio(key);
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "content-type": file.contentType || "application/pdf",
      "content-disposition": `inline; filename="${encodeURIComponent(drawing.name)}.pdf"`,
    },
  });
}
