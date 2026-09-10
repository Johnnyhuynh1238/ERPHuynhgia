// Types + fetch helpers cho app Dự toán DB. API dưới /api/projects/[id]/estimate-db/*.

export type Category = { id: string; name: string };

// PHẦN dự án (nhóm hạng mục theo HĐTK, per-dự án).
export type SectionKind = "tho" | "hoan_thien" | "nhan_cong" | "chung";
export type Section = {
  id: string;
  name: string;
  kind: SectionKind;
  sortOrder: number;
  matCount: number;
  total: number;
};
export const SECTION_KINDS: { key: SectionKind; label: string }[] = [
  { key: "tho", label: "Thô" },
  { key: "hoan_thien", label: "Hoàn thiện" },
  { key: "nhan_cong", label: "Nhân công" },
  { key: "chung", label: "Chung" },
];
export const kindLabel = (k: SectionKind | null) =>
  SECTION_KINDS.find((x) => x.key === k)?.label ?? "Khác";

export type CatalogTask = {
  id: string;
  code: string; // "07-030"
  phaseCode: string;
  phaseName: string;
  taskName: string;
};

export type Khoan = {
  id: string;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  value: number;
  contractor: string | null;
  note: string | null;
  sortOrder: number;
};

export type Material = {
  id: string;
  sectionId: string | null;
  sectionName: string | null;
  sectionKind: SectionKind | null;
  catalogId: string | null;
  taskCode: string | null;
  taskName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  taskNote: string | null;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { message?: string }).message || `Lỗi ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: (pid: string) =>
    fetch(`/api/projects/${pid}/estimate-db/meta`).then((r) =>
      j<{ categories: Category[]; tasks: CatalogTask[] }>(r),
    ),

  // PHẦN dự án
  listSections: (pid: string) =>
    fetch(`/api/projects/${pid}/sections`).then((r) => j<{ sections: Section[] }>(r)),
  addSection: (pid: string, body: { name: string; kind: SectionKind }) =>
    fetch(`/api/projects/${pid}/sections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<Section>(r)),
  patchSection: (pid: string, id: string, body: Partial<{ name: string; kind: SectionKind; sortOrder: number }>) =>
    fetch(`/api/projects/${pid}/sections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j(r)),
  delSection: (pid: string, id: string) =>
    fetch(`/api/projects/${pid}/sections/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listKhoan: (pid: string) =>
    fetch(`/api/projects/${pid}/estimate-db/khoan`).then((r) => j<{ items: Khoan[]; total: number }>(r)),
  addKhoan: (pid: string, body: Partial<Khoan>) =>
    fetch(`/api/projects/${pid}/estimate-db/khoan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<Khoan>(r)),
  patchKhoan: (id: string, body: Partial<Khoan>) =>
    fetch(`/api/estimate-db/khoan/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j(r)),
  delKhoan: (id: string) => fetch(`/api/estimate-db/khoan/${id}`, { method: "DELETE" }).then((r) => j(r)),

  listMaterials: (pid: string) =>
    fetch(`/api/projects/${pid}/estimate-db/materials`).then((r) => j<{ items: Material[]; total: number }>(r)),
  addMaterial: (pid: string, body: Partial<Material>) =>
    fetch(`/api/projects/${pid}/estimate-db/materials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j<{ id: string }>(r)),
  patchMaterial: (id: string, body: Partial<Material>) =>
    fetch(`/api/estimate-db/materials/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => j(r)),
  delMaterial: (id: string) => fetch(`/api/estimate-db/materials/${id}`, { method: "DELETE" }).then((r) => j(r)),
};

export const fmt = (n: number) => n.toLocaleString("vi-VN");
