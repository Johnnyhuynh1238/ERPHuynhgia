// Nguồn CHUNG gộp vật tư dự toán — dùng cho tab "Vật tư" (dự toán) và màn "Mua hàng".
// Sửa dự toán → cả 2 màn đổi theo. Khác biệt duy nhất: mua hàng bật cờ `collapseBase`
// để gộp bỏ phần " (vị trí công tác…)" → 1 vật tư = 1 dòng tổng SL.

export type MaterialLike = {
  id?: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  categoryName: string | null;
  catalogId?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
};

// 1 vật tư (gộp theo tên + đơn vị) — nằm trong 1 chủng loại
export type VtItem<M extends MaterialLike = MaterialLike> = {
  key: string;
  name: string;
  unit: string;
  qty: number;
  amount: number; // Σ SL*đơn giá
  members: M[]; // các lần xuất hiện ở nhiều công tác/vị trí
  uniformPrice: number | null; // đơn giá nếu mọi member cùng giá, ngược lại null
};

// 1 chủng loại = 1 nhóm
export type VtGroup<M extends MaterialLike = MaterialLike> = {
  key: string;
  categoryName: string | null;
  amount: number;
  items: VtItem<M>[];
};

const amountOf = (m: MaterialLike) => Math.round(m.quantity * m.unitPrice);

// Bỏ phần " (…)" đầu tiên (vị trí công tác / quy cách) → tên gốc để gộp tổng khi mua.
export const baseName = (n: string) => {
  const i = n.indexOf(" (");
  return (i >= 0 ? n.slice(0, i) : n).trim();
};

// Gộp 2 tầng: chủng loại → vật tư (tên + đvt). `collapseBase` = gộp theo baseName (tổng SL).
// `priorityCats` = tên chủng loại (thường/không dấu tuỳ hoa) ghim lên đầu theo đúng thứ tự truyền vào;
//   các chủng loại còn lại vẫn xếp tiền giảm dần phía sau. Ghim áp trong từng siêu nhóm (bucket giữ thứ tự).
export function buildVtGroups<M extends MaterialLike>(
  materials: M[],
  opts?: { collapseBase?: boolean; priorityCats?: string[] },
): VtGroup<M>[] {
  const collapse = !!opts?.collapseBase;
  const prio = (opts?.priorityCats ?? []).map((s) => s.toLowerCase().trim());
  const rankOf = (name: string | null) => {
    const i = prio.indexOf((name ?? "").toLowerCase().trim());
    return i < 0 ? prio.length : i;
  };
  const cats = new Map<string, VtGroup<M>>();
  const itemMaps = new Map<string, Map<string, VtItem<M>>>();
  for (const m of materials) {
    const catName = m.categoryName ?? null;
    const catKey = (catName ?? "__none").toLowerCase();
    let cg = cats.get(catKey);
    if (!cg) {
      cg = { key: catKey, categoryName: catName, amount: 0, items: [] };
      cats.set(catKey, cg);
      itemMaps.set(catKey, new Map());
    }
    const im = itemMaps.get(catKey)!;
    const disp = collapse ? baseName(m.name) : m.name;
    const itemKey = `${disp.toLowerCase()}|${m.unit.toLowerCase()}`;
    let it = im.get(itemKey);
    if (!it) {
      it = { key: itemKey, name: disp, unit: m.unit, qty: 0, amount: 0, members: [], uniformPrice: null };
      im.set(itemKey, it);
      cg.items.push(it);
    }
    it.qty += m.quantity;
    it.amount += amountOf(m);
    it.members.push(m);
    cg.amount += amountOf(m);
  }
  const arr = Array.from(cats.values());
  for (const cg of arr) {
    for (const it of cg.items) {
      const prices = new Set(it.members.map((x) => x.unitPrice));
      it.uniformPrice = prices.size === 1 ? it.members[0].unitPrice : null;
    }
    cg.items.sort((a, b) => b.amount - a.amount);
  }
  return arr.sort((a, b) => {
    const ra = rankOf(a.categoryName);
    const rb = rankOf(b.categoryName);
    return ra !== rb ? ra - rb : b.amount - a.amount;
  });
}

// ── Siêu nhóm: gộp chủng loại → 3 nhóm Thô / ME / Hoàn thiện theo giai đoạn (phaseCode) ──
//   phaseCode lấy từ taskCode "GĐ-CT" (vd "07-03" -> GĐ "07"). 01–06 = Thô, 07 = ME, 08–09 = HT.
//   VT không có catalog -> Thô. Nguồn CHUNG cho tab Vật tư (dự toán) + màn Mua hàng.
export type SuperKey = "tho" | "me" | "ht";
export const SUPER_LABEL: Record<SuperKey, string> = { tho: "Thô", me: "ME (Cơ điện)", ht: "Hoàn thiện" };
export const SUPER_ORDER: SuperKey[] = ["tho", "me", "ht"];

function phaseToSuper(phase: string | null): SuperKey {
  if (phase === "07") return "me";
  if (phase === "08" || phase === "09") return "ht";
  return "tho"; // 01–06 + không xác định
}

export type SuperGroup<M extends MaterialLike = MaterialLike> = {
  key: SuperKey;
  label: string;
  amount: number;
  groups: VtGroup<M>[];
};

// Chủng loại thuộc siêu nhóm có tổng tiền trội nhất (member tính theo phaseCode của nó).
function superOfGroup<M extends MaterialLike>(g: VtGroup<M>): SuperKey {
  const tally: Record<SuperKey, number> = { tho: 0, me: 0, ht: 0 };
  for (const it of g.items) {
    for (const m of it.members) {
      const phase = (m.taskCode ?? "").split("-")[0] || null;
      tally[phaseToSuper(phase)] += amountOf(m);
    }
  }
  return SUPER_ORDER.reduce((best, k) => (tally[k] > tally[best] ? k : best), "tho" as SuperKey);
}

export function buildSuperGroups<M extends MaterialLike>(vtGroups: VtGroup<M>[]): SuperGroup<M>[] {
  const buckets: Record<SuperKey, VtGroup<M>[]> = { tho: [], me: [], ht: [] };
  for (const g of vtGroups) buckets[superOfGroup(g)].push(g);
  return SUPER_ORDER.map((k) => ({
    key: k,
    label: SUPER_LABEL[k],
    amount: buckets[k].reduce((s, g) => s + g.amount, 0),
    groups: buckets[k],
  })).filter((sg) => sg.groups.length > 0);
}
