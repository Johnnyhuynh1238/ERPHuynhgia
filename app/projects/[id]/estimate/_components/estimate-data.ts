// Kiểu dữ liệu + helper dùng chung 3 tab Dự toán (Khối lượng / Vật tư / Khoán)

export type Vt = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  directUnitPrice: number | null; // giá mua dự kiến
  note: string | null;
  materialPriceId: string | null;
  materialPriceName: string | null;
};

export type CongTac = {
  id: string;
  normCode: string | null;
  normName: string | null;
  name: string;
  unit: string;
  formula: string | null;
  quantity: number;
  status: string;
  note: string | null;
  vtChildren: Vt[];
};

export type Item = { id: string; name: string; status: string; lines: CongTac[] };
export type Group = { id: string; name: string; isKhoan: boolean; items: Item[] };
export type Khoan = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  directUnitPrice: number | null;
  khoanGroup: string; // nc | khac
  note: string | null;
};

export type EstimateData = { groups: Group[]; khoan: Khoan[] };

export async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new Error(data?.message || `Lỗi ${r.status}`);
  }
  return r.json();
}

export const fmtQty = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const fmtVnd = (n: number) => n.toLocaleString("vi-VN");
