// Danh sách mua hàng GHI TAY (projects.mua_hang_list) — nguồn DUY NHẤT của màn Mua hàng.
// AI soạn tay từ bóc tách dự toán + hao hụt, nhóm theo PHẦN (tên = hạng mục ngân sách / project_sections).
// Không tự gộp từ dự toán nữa: muốn đổi SL/giá → ghi lại JSON này.
//
// Cấu trúc: { basis, groups: [{ name, items: [{ ten, dvt, sl, gia, ghi }] }] }

export type MhListItem = {
  key: string; // `${ten}|${dvt}` chữ thường — khớp key đơn mua cũ
  name: string;
  unit: string;
  qty: number; // SL cần mua (đã gồm hao hụt)
  price: number; // đơn giá dự kiến
  note: string;
  group: string; // tên PHẦN
};

export type MhListGroup = { name: string; amount: number; items: MhListItem[] };

export type MhList = { basis: string; groups: MhListGroup[] };

export const mhItemKey = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;

export function parseMhList(raw: unknown): MhList {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const groups: MhListGroup[] = [];
  for (const g of Array.isArray(o.groups) ? o.groups : []) {
    if (!g || typeof g !== "object") continue;
    const gg = g as Record<string, unknown>;
    const name = String(gg.name || "").trim();
    if (!name) continue;
    const items: MhListItem[] = [];
    for (const it of Array.isArray(gg.items) ? gg.items : []) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const ten = String(r.ten || "").trim();
      const dvt = String(r.dvt || "").trim();
      const qty = Number(r.sl) || 0;
      if (!ten || !(qty > 0)) continue;
      items.push({
        key: mhItemKey(ten, dvt),
        name: ten,
        unit: dvt,
        qty,
        price: Math.max(0, Math.round(Number(r.gia) || 0)),
        note: String(r.ghi || "").trim(),
        group: name,
      });
    }
    groups.push({ name, amount: items.reduce((s, x) => s + x.qty * x.price, 0), items });
  }
  return { basis: String(o.basis || "").trim(), groups };
}

// Σ SL cần mua theo vật tư (mọi PHẦN) — trần SL cho kế toán.
export function mhListQtyByKey(list: MhList): Record<string, number> {
  const m: Record<string, number> = {};
  for (const g of list.groups) for (const it of g.items) m[it.key] = (m[it.key] || 0) + it.qty;
  return m;
}
