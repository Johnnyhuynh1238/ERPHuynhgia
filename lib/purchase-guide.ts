// Hướng dẫn mua hàng — dựng từ PHỤ LỤC VẬT TƯ trong báo giá HĐ đã ký với khách
// (design_contracts.quote_data: thoPhanBaoGia[].vt + hoanThien[].vt/vtGia + khongBaoGom),
// rồi chồng điều chỉnh theo phụ lục HĐ (purchase_guide_adjusts). KHÔNG lấy từ dự toán.
// Không trả giá — KT mua theo chủng loại/quy cách, giám sát đối chiếu khi nhận hàng.

export type GuideMode = "khach_cap" | "doi" | "them";

export type GuideAdjust = {
  itemKey: string;
  mode: GuideMode;
  groupName: string | null;
  ten: string | null;
  loai: string | null;
  quycach: string | null;
  note: string | null;
  source: string | null;
};

export type GuideRow = {
  key: string;
  ten: string;
  loai: string; // chủng loại / thương hiệu
  quycach: string;
  usedIn: string[]; // thô: các PHẦN dùng VT này
  adjust: GuideAdjust | null;
};

export type GuideQty = { ten: string; kl: number; dvt: string };

export type GuideGroup = {
  key: string; // thô: "thoG|<nhóm>", hoàn thiện: "htg|<hạng mục>"
  kind: "tho" | "ht";
  name: string;
  rows: GuideRow[];
  qty: GuideQty[]; // khối lượng theo HĐ (chỉ hoàn thiện)
  notes: string[];
  adjust: GuideAdjust | null; // điều chỉnh cả nhóm/hạng mục
};

export type PurchaseGuide = {
  tho: GuideGroup[];
  ht: GuideGroup[];
  excluded: { ten: string; ghi: string }[];
  extras: GuideAdjust[]; // VT thêm mới theo phụ lục, không khớp nhóm nào
};

const str = (v: unknown) => (typeof v === "string" ? v.replace(/ /g, " ").trim() : "");
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
const uniqJoin = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).join(" · ");
const stripBullet = (s: string) => s.replace(/^[•\s]+/, "").trim();

export function buildPurchaseGuide(quoteData: unknown, adjusts: GuideAdjust[]): PurchaseGuide {
  const q = (quoteData && typeof quoteData === "object" ? quoteData : {}) as Record<string, unknown>;
  const adj = new Map(adjusts.map((a) => [a.itemKey, a]));
  const used = new Set<string>();
  const take = (k: string) => {
    const a = adj.get(k) ?? null;
    if (a) used.add(k);
    return a;
  };

  // ── Phần thô: gom theo nhóm VT, mỗi tên VT 1 dòng (gộp chủng loại/quy cách của các PHẦN) ──
  const thoMap = new Map<string, Map<string, { loai: string[]; quycach: string[]; usedIn: string[] }>>();
  for (const part of arr(q.thoPhanBaoGia)) {
    const nhom = str(part.nhomVt) || str(part.name) || "Khác";
    const partName = str(part.name);
    if (!thoMap.has(nhom)) thoMap.set(nhom, new Map());
    const g = thoMap.get(nhom)!;
    for (const v of arr(part.vt)) {
      const ten = str(v.ten);
      if (!ten) continue;
      if (!g.has(ten)) g.set(ten, { loai: [], quycach: [], usedIn: [] });
      const r = g.get(ten)!;
      r.loai.push(str(v.loai));
      r.quycach.push(str(v.quycach));
      if (partName) r.usedIn.push(partName);
    }
  }
  const tho: GuideGroup[] = Array.from(thoMap.entries()).map(([nhom, rows]) => ({
    key: `thoG|${nhom}`,
    kind: "tho",
    name: nhom,
    rows: Array.from(rows.entries()).map(([ten, r]) => {
      const key = `tho|${nhom}|${ten}`;
      return {
        key,
        ten,
        loai: uniqJoin(r.loai),
        quycach: uniqJoin(r.quycach),
        usedIn: Array.from(new Set(r.usedIn)),
        adjust: take(key),
      };
    }),
    qty: [],
    notes: [],
    adjust: take(`thoG|${nhom}`),
  }));

  // ── Hoàn thiện: theo hạng mục. Có bảng chủng loại (vt) thì dùng; không thì lấy dòng vtGia ──
  const ht: GuideGroup[] = arr(q.hoanThien).map((h) => {
    const name = str(h.name) || "Hạng mục";
    const vt = arr(h.vt);
    const vtGia = arr(h.vtGia);
    const src = vt.length
      ? vt.map((v) => ({ ten: str(v.ten), loai: str(v.loai), quycach: str(v.mota) || str(v.quycach) }))
      : vtGia.map((v) => ({ ten: str(v.ten), loai: "", quycach: "" }));
    return {
      key: `htg|${name}`,
      kind: "ht" as const,
      name,
      rows: src
        .filter((r) => r.ten)
        .map((r) => {
          const key = `ht|${name}|${r.ten}`;
          return { key, ...r, usedIn: [], adjust: take(key) };
        }),
      qty: vtGia
        .map((v) => ({ ten: str(v.ten), kl: Number(v.kl) || 0, dvt: str(v.dvt) }))
        .filter((x) => x.ten),
      notes: str(h.ghi)
        .split(/\n+/)
        .map(stripBullet)
        .filter(Boolean),
      adjust: take(`htg|${name}`),
    };
  });

  const excluded = arr(q.khongBaoGom)
    .map((x) => ({ ten: str(x.ten), ghi: str(x.ghi) }))
    .filter((x) => x.ten);

  // VT thêm mới theo phụ lục: gắn vào nhóm cùng tên nếu có, còn lại để riêng
  const extras: GuideAdjust[] = [];
  for (const a of adjusts) {
    if (used.has(a.itemKey)) continue;
    if (!a.itemKey.startsWith("extra|")) continue; // điều chỉnh mồ côi (quote đổi tên) — bỏ qua
    const g = [...tho, ...ht].find((x) => x.name === a.groupName);
    if (g) {
      g.rows.push({
        key: a.itemKey,
        ten: a.ten || "",
        loai: a.loai || "",
        quycach: a.quycach || "",
        usedIn: [],
        adjust: a,
      });
    } else extras.push(a);
  }

  return { tho, ht, excluded, extras };
}
