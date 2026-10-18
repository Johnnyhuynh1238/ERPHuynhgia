import { NextResponse } from "next/server";
import { EOD_MAX_PHOTOS_PER_PROJECT, parseKsTaskToken, submitEod, submitHeadcount, type EodPhoto } from "@/lib/ks-daily-report";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // client đã nén ~1600px, 8MB là dư

/** KS bấm Lưu trên link /nv/[token]. Token HMAC tự xác thực, không cần session. */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const parsed = parseKsTaskToken(params.token);
  if (!parsed) return NextResponse.json({ ok: false, message: "Link không hợp lệ." }, { status: 400 });

  try {
    if (parsed.kind === "headcount") {
      const body = (await request.json().catch(() => null)) as { counts?: Record<string, unknown> } | null;
      const r = await submitHeadcount(params.token, body?.counts || {});
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }

    // eod: multipart — "data" = JSON {rowId: {tasksDone, issues}}, file "photo_<rowId>" (nhiều file).
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 400 });
    let data: Record<string, { tasksDone?: unknown; issues?: unknown }> = {};
    try {
      data = JSON.parse(String(form.get("data") || "{}"));
    } catch {
      return NextResponse.json({ ok: false, message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    const photos: Record<string, EodPhoto[]> = {};
    for (const [field, value] of Array.from(form.entries())) {
      const m = /^photo_([0-9a-f-]{36})$/.exec(field);
      if (!m || typeof value === "string") continue;
      if (value.size > MAX_PHOTO_BYTES) return NextResponse.json({ ok: false, message: "Ảnh quá lớn." }, { status: 400 });
      const list = (photos[m[1]] ||= []);
      if (list.length >= EOD_MAX_PHOTOS_PER_PROJECT) {
        return NextResponse.json({ ok: false, message: `Tối đa ${EOD_MAX_PHOTOS_PER_PROJECT} ảnh mỗi công trình.` }, { status: 400 });
      }
      list.push({ type: value.type, body: Buffer.from(await value.arrayBuffer()) });
    }
    const r = await submitEod(params.token, data, photos);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (err) {
    console.error("[nv submit]", err);
    return NextResponse.json({ ok: false, message: "Lỗi hệ thống, anh thử lại." }, { status: 500 });
  }
}
