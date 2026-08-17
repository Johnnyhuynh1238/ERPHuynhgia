import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { EMPTY_ESTIMATE_DETAIL, type EDItem, type EstimateDetail } from "@/lib/estimate-detail";
import { syncQuoteFromDetail } from "@/lib/quote-compute";

// PATCH: cập nhật estimateDetail (jsonb) — % lãi thô (markupTho) và/hoặc danh sách hạng mục (items).
// Mỗi lần lưu tự ĐỒNG BỘ NGƯỢC sang quoteData: đơn giá m² thô = Σvốn×(1+lãi)÷m², hạng mục + chủng loại.
// Admin-only. Khoá khi HĐ đã chuyển thi công.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON không hợp lệ" }, { status: 400 });
  }
  const b = (body ?? {}) as { markupTho?: unknown; items?: unknown };

  const c = await prisma.designContract.findUnique({
    where: { id: params.id },
    select: { id: true, estimateDetail: true, quoteData: true, projectId: true },
  });
  if (!c) return NextResponse.json({ message: "Không tìm thấy HĐ" }, { status: 404 });
  if (c.projectId) return NextResponse.json({ message: "HĐ đã chuyển thi công, không sửa" }, { status: 409 });

  const detail = (c.estimateDetail ?? EMPTY_ESTIMATE_DETAIL) as EstimateDetail;
  const next: EstimateDetail = { ...detail };

  if (b.markupTho != null) {
    const m = Number(b.markupTho);
    if (!isFinite(m) || m < 0 || m > 5) {
      return NextResponse.json({ message: "% lãi không hợp lệ (0–5)" }, { status: 400 });
    }
    next.markupTho = m;
  }

  if (b.items != null) {
    if (!Array.isArray(b.items)) {
      return NextResponse.json({ message: "items phải là mảng" }, { status: 400 });
    }
    const items = sanitizeItems(b.items as unknown[]);
    if (items === null) {
      return NextResponse.json({ message: "Dữ liệu hạng mục không hợp lệ" }, { status: 400 });
    }
    next.items = items;
  }

  // Đồng bộ ngược sang báo giá khách.
  const { quoteData } = syncQuoteFromDetail(c.quoteData, next);

  await prisma.designContract.update({
    where: { id: params.id },
    data: {
      estimateDetail: next as unknown as Prisma.InputJsonValue,
      quoteData: quoteData as unknown as Prisma.InputJsonValue,
      quoteUpdatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, markupTho: next.markupTho });
}

// Giữ đúng shape EDItem, không cho rác lọt vào jsonb. Giữ nguyên trường KL/bản vẽ có sẵn.
function sanitizeItems(raw: unknown[]): EDItem[] | null {
  const out: EDItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const it = r as Record<string, unknown>;
    if (typeof it.id !== "string" || typeof it.name !== "string") return null;
    const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));
    const cost = it.cost && typeof it.cost === "object" ? (it.cost as Record<string, unknown>) : null;
    const materials = Array.isArray(cost?.materials)
      ? (cost!.materials as unknown[]).map((m) => {
          const mm = (m ?? {}) as Record<string, unknown>;
          return {
            ten: String(mm.ten ?? ""),
            dvt: String(mm.dvt ?? ""),
            kl: Number(mm.kl) || 0,
            gia: Number(mm.gia) || 0,
          };
        })
      : [];
    const custSpec = Array.isArray(it.custSpec)
      ? (it.custSpec as unknown[]).map((v) => {
          const vv = (v ?? {}) as Record<string, unknown>;
          return {
            ten: String(vv.ten ?? ""),
            loai: vv.loai != null ? String(vv.loai) : undefined,
            quycach: vv.quycach != null ? String(vv.quycach) : undefined,
          };
        })
      : undefined;

    const item: EDItem = {
      id: it.id,
      name: it.name,
      tag: typeof it.tag === "string" ? it.tag : undefined,
      result: typeof it.result === "string" ? it.result : undefined,
      cols: Array.isArray(it.cols) ? (it.cols as unknown[]).map(String) : [],
      rows: Array.isArray(it.rows)
        ? (it.rows as unknown[]).map((row) => (Array.isArray(row) ? row.map(String) : []))
        : [],
      formula: typeof it.formula === "string" ? it.formula : undefined,
      note: typeof it.note === "string" ? it.note : undefined,
      drawings: Array.isArray(it.drawings)
        ? (it.drawings as unknown[]).map((d) => {
            const dd = (d ?? {}) as Record<string, unknown>;
            return { key: String(dd.key ?? ""), name: String(dd.name ?? ""), type: dd.type != null ? String(dd.type) : undefined };
          })
        : [],
      group: typeof it.group === "string" ? it.group : undefined,
      groupName: typeof it.groupName === "string" ? it.groupName : undefined,
      noNum: it.noNum === true ? true : undefined,
      part: it.part === "ht" ? "ht" : it.part === "tho" ? "tho" : undefined,
      custSpec,
      cost: cost
        ? {
            nc: Number(cost.nc) || 0,
            ncQty: num(cost.ncQty),
            ncGia: num(cost.ncGia),
            ncUnit: typeof cost.ncUnit === "string" ? cost.ncUnit : undefined,
            materials,
            haoHutPct: Number(cost.haoHutPct) || 0,
          }
        : undefined,
    };
    out.push(item);
  }
  return out;
}
