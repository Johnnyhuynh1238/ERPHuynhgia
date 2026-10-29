/**
 * AI Mua hàng (muahang / muahangkt) gắn ảnh nhận hàng vào đơn — công cụ văn phòng `mh-anh`
 * (SOP-06 GĐ-10). AI không có phiên đăng nhập ERP nên tự auth bằng Bearer <MH_AI_UPLOAD_SECRET>.
 *
 * Body multipart: projectCode, seq (số đơn #), kind = phieu|hang, file (ảnh ≤ 8MB), ai = muahang|muahangkt.
 * Làm đúng như màn Mua hàng: tải ảnh lên MinIO (cùng thư mục với receipt-photo) rồi THÊM {url,kind}
 * vào receipt_images của đơn. Không đổi trạng thái, tiền, vật tư — chuyển "đã nhận" vẫn đi luồng cũ.
 * Đơn đã thanh toán (paid) bị khoá như PATCH sửa đơn.
 */
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putObjectToMinio } from "@/lib/minio";

export const runtime = "nodejs";

const SECRET = process.env.MH_AI_UPLOAD_SECRET || "";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BYTES = 8 * 1024 * 1024;
const AI_IDS = new Set(["muahang", "muahangkt"]);

function extFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

function secretOk(header: string) {
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!SECRET || !m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!SECRET) return NextResponse.json({ message: "Chưa cấu hình MH_AI_UPLOAD_SECRET" }, { status: 503 });
  if (!secretOk(request.headers.get("authorization") || "")) {
    return NextResponse.json({ message: "Sai mã xác thực" }, { status: 401 });
  }

  const formData = await request.formData();
  const ai = String(formData.get("ai") || "");
  if (!AI_IDS.has(ai)) return NextResponse.json({ message: "ai phải là muahang hoặc muahangkt" }, { status: 400 });
  const kindRaw = String(formData.get("kind") || "");
  if (kindRaw !== "phieu" && kindRaw !== "hang") {
    return NextResponse.json({ message: "kind phải là phieu hoặc hang" }, { status: 400 });
  }
  const kind = kindRaw;
  const projectCode = String(formData.get("projectCode") || "").trim();
  const seq = Number(formData.get("seq"));
  if (!projectCode || !Number.isInteger(seq) || seq <= 0) {
    return NextResponse.json({ message: "Thiếu mã dự án hoặc số đơn" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ message: "Chỉ hỗ trợ ảnh jpg/png/webp/heic" }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ message: "Ảnh quá lớn (tối đa 8MB)" }, { status: 400 });

  const project = await prisma.project.findUnique({ where: { code: projectCode }, select: { id: true } });
  const order = project
    ? await prisma.mhOrder.findUnique({
        where: { projectId_seq: { projectId: project.id, seq } },
        select: { id: true, status: true },
      })
    : null;
  if (!order) return NextResponse.json({ message: `Không thấy đơn #${seq} dự án ${projectCode}` }, { status: 404 });
  if (order.status === "paid") {
    return NextResponse.json({ message: "Đơn đã thanh toán — không gắn thêm ảnh" }, { status: 403 });
  }

  const fileName = `${kind}-${Date.now()}-${crypto.randomUUID()}.${extFromType(file.type)}`;
  const key = `mua-hang/${order.id}/${fileName}`;
  await putObjectToMinio({ key, body: Buffer.from(bytes), contentType: file.type });
  const img = { url: `minio://${key}`, kind };

  // Thêm 1 phần tử trong 1 câu UPDATE (2 ảnh gửi cùng lúc không đè nhau); guard lại status ≠ paid.
  const n = await prisma.$executeRaw`
    UPDATE mh_orders
    SET receipt_images = COALESCE(receipt_images, '[]'::jsonb) || ${JSON.stringify([img])}::jsonb,
        updated_at = now()
    WHERE id = ${order.id}::uuid AND status <> 'paid'`;
  if (n !== 1) return NextResponse.json({ message: "Đơn vừa đổi sang đã thanh toán — không gắn ảnh" }, { status: 409 });

  console.info(`[mua-hang-ai] ${ai} gắn ảnh ${kind} vào đơn #${seq} ${projectCode}`);
  return NextResponse.json({ ok: true, orderId: order.id, seq, projectCode, ...img });
}
