// Nhóm chi phí chung — tách khỏi company-forecast.ts (import prisma) để client component dùng được.
export const OVERHEAD_GROUPS = [
  { key: "van_hanh", label: "Vận hành công ty" },
  { key: "no_tai_chinh", label: "Nợ & tài chính" },
  { key: "ca_nhan", label: "Anh & gia đình" },
] as const;
