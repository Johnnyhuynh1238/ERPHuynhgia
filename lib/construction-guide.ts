// Hướng dẫn thi công & nghiệm thu — tài liệu IN cho giám sát dùng giấy tại công trình.
// Mỗi hạng mục của HĐ (quote_data: thoPhanBaoGia + hoanThien) = 1 hướng dẫn gồm:
//   phạm vi theo HĐ + vật tư sử dụng (mới nhất theo phụ lục, từ buildPurchaseGuide)
//   + các điểm dừng nghiệm thu = công tác con của mẫu Kỹ thuật thi công khớp tên hạng mục
//     (thư viện chung bảng construction_techniques, sửa ở tile /ky-thuat-thi-cong).
// Thêm loại hạng mục mới = thêm mẫu ở tile đó (đặt loại cụ thể trước loại chung).

import { buildPurchaseGuide, type GuideAdjust, type GuideGroup } from "./purchase-guide";
import { receiveCheckFor } from "./receiving-check";
import {
  DEFAULT_TECHNIQUES,
  GENERIC_TASKS,
  matchesKeywords,
  type CtCrit,
  type CtTask,
  type CtTechnique,
} from "./construction-technique";

export type CgCrit = CtCrit;
export type CgVt = {
  ten: string;
  loai: string;
  quycach: string;
  khachCap: boolean;
  src: string; // nhãn phụ lục nếu đã đổi so với HĐ gốc
  check: string[]; // kiểm khi nhận hàng
};
export type CgItem = {
  no: number;
  name: string;
  kind: "tho" | "ht";
  scope: string[];
  notes: string[];
  vt: CgVt[];
  tech: { code: string; name: string } | null; // mẫu Kỹ thuật thi công đã khớp (null = điểm dừng chung)
  stages: { no: string; title: string; steps: string[]; notes: string[]; items: CgCrit[] }[];
};
export type ConstructionGuide = { items: CgItem[]; excluded: { ten: string; ghi: string }[] };

// ───────────────────────── Dựng tài liệu ─────────────────────────
const str = (v: unknown) => (typeof v === "string" ? v.replace(/ /g, " ").trim() : "");
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
const bullets = (s: string) =>
  s
    .split(/\n+/)
    .map((x) => x.replace(/^[•\s]+/, "").trim())
    .filter(Boolean);

function vtOf(g: GuideGroup | undefined, vtKeywords = ""): CgVt[] {
  if (!g) return [];
  return g.rows
    .filter((r) => !vtKeywords.trim() || matchesKeywords(r.ten, vtKeywords))
    .map((r) => {
      const a = r.adjust ?? g.adjust;
      const kc = a?.mode === "khach_cap";
      const loai = (!kc && a?.loai) || r.loai;
      return {
        ten: r.ten,
        loai,
        quycach: (!kc && a?.quycach) || r.quycach,
        khachCap: kc,
        src: a ? a.source || "Phụ lục" : "",
        check: kc ? [] : receiveCheckFor(r.ten, loai).check,
      };
    });
}

// techniques: mẫu đang dùng (loadTechniques, đã sort). Bỏ trống → bộ mẫu gốc trong code.
export function buildConstructionGuide(
  quoteData: unknown,
  adjusts: GuideAdjust[],
  techniques: CtTechnique[] = DEFAULT_TECHNIQUES,
): ConstructionGuide {
  const q = (quoteData && typeof quoteData === "object" ? quoteData : {}) as Record<string, unknown>;
  const pg = buildPurchaseGuide(quoteData, adjusts);
  const items: CgItem[] = [];

  // Tên các công tác chi tiết theo nhóm (để bật điểm dừng tuỳ chọn, VD bể phốt / tường bao nền)
  const hmText = arr(q.thoHangMuc)
    .map((h) => `${str(h.nhom)} ${str(h.ten)}`)
    .join(" | ");

  const active = techniques.filter((k) => k.isActive && k.matchKeywords.trim());
  const pick = (name: string) => active.find((k) => matchesKeywords(name, k.matchKeywords));
  const techOf = (k: CtTechnique | undefined) => (k ? { code: k.code, name: k.name } : null);
  const stagesFor = (kind: CtTechnique | undefined, ctx: string, no: number) => {
    const tasks: CtTask[] = kind && kind.tasks.length ? kind.tasks : GENERIC_TASKS;
    return tasks
      .filter((s) => !s.when.trim() || matchesKeywords(ctx, s.when))
      .map((s, i) => ({ no: `${no}.${i + 1}`, title: s.title, steps: s.steps, notes: s.notes, items: s.criteria }));
  };

  for (const p of arr(q.thoPhanBaoGia)) {
    const name = str(p.name) || "Hạng mục";
    const kind = pick(name.replace(/^phần\s+/i, ""));
    const no = items.length + 1;
    const scope = str(p.dienGiai);
    // phạm vi + tên công tác chi tiết cùng nhóm VT → bật điểm dừng tuỳ chọn (when)
    const ctx = `${scope} ${hmText
      .split(" | ")
      .filter((t) => t.startsWith(str(p.nhomVt)))
      .join(" ")}`;
    items.push({
      no,
      name,
      kind: "tho",
      scope: scope ? [scope] : [],
      notes: [],
      vt: vtOf(
        pg.tho.find((g) => g.name === (str(p.nhomVt) || name)),
        kind?.vtKeywords,
      ),
      tech: techOf(kind),
      stages: stagesFor(kind, ctx, no),
    });
  }

  for (const h of arr(q.hoanThien)) {
    const name = str(h.name) || "Hạng mục";
    const kind = pick(name);
    const no = items.length + 1;
    const scope = arr(h.costs)
      .map((x) => str(x.label))
      .filter(Boolean);
    items.push({
      no,
      name,
      kind: "ht",
      scope,
      notes: bullets(str(h.ghi)),
      vt: vtOf(pg.ht.find((g) => g.name === name)),
      tech: techOf(kind),
      stages: stagesFor(kind, `${name} ${scope.join(" ")}`, no),
    });
  }

  return { items, excluded: pg.excluded };
}
