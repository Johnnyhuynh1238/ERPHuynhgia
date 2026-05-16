import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getObjectFromMinio } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import { canUserAccessSubContract, requireSubContractReadUser } from "@/lib/sub-contract-auth";

export const runtime = "nodejs";

function contentTypeFor(value: string) {
  const ext = path.extname(value.split("?")[0]).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireSubContractReadUser();
  if (error || !user) return error;

  const payment = await prisma.subPayment.findUnique({
    where: { id: params.id },
    select: { id: true, subContractId: true, receiptUrl: true },
  });
  if (!payment?.receiptUrl) return NextResponse.json({ message: "Không có chứng từ" }, { status: 404 });

  const access = await canUserAccessSubContract(payment.subContractId, { id: user.id, role: user.role });
  if (!access.canAccess) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  if (payment.receiptUrl.startsWith("minio://")) {
    try {
      const obj = await getObjectFromMinio(payment.receiptUrl.slice("minio://".length));
      return new NextResponse(new Uint8Array(obj.buffer), {
        headers: {
          "Content-Type": obj.contentType || contentTypeFor(payment.receiptUrl),
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return NextResponse.json({ message: "Không đọc được file" }, { status: 502 });
    }
  }

  const absPath = path.join(process.cwd(), "public", payment.receiptUrl.replace(/^\//, ""));
  try {
    const buffer = await fs.readFile(absPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypeFor(absPath),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ message: "Không đọc được file" }, { status: 404 });
  }
}
