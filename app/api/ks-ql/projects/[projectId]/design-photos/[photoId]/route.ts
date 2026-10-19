import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { extractMinioKey } from "@/lib/design-photos";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { findKsProject } from "@/lib/ks-ql-project-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: KS phụ trách xem ảnh 3D / thiết kế của dự án mình (mặc định xem hết). ?variant=thumb → ảnh nhỏ.
export async function GET(req: Request, { params }: { params: { projectId: string; photoId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });

  const project = await findKsProject(params.projectId, user.id);
  if (!project) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const photo = await prisma.designPhoto.findFirst({
    where: { id: params.photoId, group: { projectId: project.id } },
    select: { photoUrl: true, thumbnailUrl: true },
  });
  if (!photo) return NextResponse.json({ message: "Không tìm thấy ảnh" }, { status: 404 });

  const thumb = new URL(req.url).searchParams.get("variant") === "thumb";
  const key = extractMinioKey(thumb ? photo.thumbnailUrl : photo.photoUrl);
  if (!key) return NextResponse.json({ message: "Không đọc được ảnh" }, { status: 404 });

  const { buffer, contentType } = await getObjectFromMinio(key);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": contentType || "image/jpeg",
      "cache-control": "private, max-age=300",
    },
  });
}
