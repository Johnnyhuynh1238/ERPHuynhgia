import { NextResponse } from "next/server";
import { ESIGN_MAX_PHOTOS, findEsignByToken, ksSubmit, partyReject, partySign } from "@/lib/acceptance-esign";
import { getClientIpFromHeaders } from "@/lib/customer-portal";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // client đã nén ~1600px

/** Bấm Ký / Chưa đồng ý trên /ky/[token]. Token random trong DB tự xác thực, không cần session. */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const found = await findEsignByToken(params.token);
  if (!found) return NextResponse.json({ ok: false, message: "Link không hợp lệ." }, { status: 400 });
  const ip = getClientIpFromHeaders(request.headers);
  const ua = request.headers.get("user-agent");

  try {
    if (found.role === "ks") {
      // multipart: "data" = JSON {items, note, keepPhotos, signature}, file "photo" (nhiều).
      const form = await request.formData().catch(() => null);
      if (!form) return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 400 });
      let data: { items?: unknown; note?: unknown; keepPhotos?: unknown; signature?: unknown } = {};
      try {
        data = JSON.parse(String(form.get("data") || "{}"));
      } catch {
        return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 400 });
      }
      const newPhotos: { type: string; body: Buffer }[] = [];
      for (const value of form.getAll("photo")) {
        if (typeof value === "string") continue;
        if (value.size > MAX_PHOTO_BYTES) return NextResponse.json({ ok: false, message: "Ảnh quá lớn." }, { status: 400 });
        if (newPhotos.length >= ESIGN_MAX_PHOTOS) break;
        newPhotos.push({ type: value.type, body: Buffer.from(await value.arrayBuffer()) });
      }
      const r = await ksSubmit(params.token, { ...data, newPhotos, ip, ua });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }

    const body = (await request.json().catch(() => null)) as
      | { action?: string; name?: unknown; signature?: unknown; note?: unknown; agree?: unknown }
      | null;
    if (body?.action === "sign") {
      const r = await partySign(params.token, { ...body, ip, ua });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    if (body?.action === "reject") {
      const r = await partyReject(params.token, { note: body.note });
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 400 });
  } catch (err) {
    console.error("[ky submit]", err);
    return NextResponse.json({ ok: false, message: "Lỗi hệ thống, thử lại sau ít phút." }, { status: 500 });
  }
}
