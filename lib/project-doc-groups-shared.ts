import type { ProjectDocumentCategory } from "@prisma/client";

// Phần dùng chung client + server (không import prisma) cho màn Hồ sơ dự án.
export const SYSTEM_GROUP_KEYS = ["ban_ve", "hd_chu_nha", "hd_thau_phu", "hd_giam_sat", "hd_ke_toan"] as const;
export type SystemGroupKey = (typeof SYSTEM_GROUP_KEYS)[number];

// Nhóm chỉ admin xem (kỹ sư / kế toán / thầu phụ không bao giờ thấy, kể cả cấp quyền riêng từng file).
// Chủ nhà vẫn bật/tắt được qua cổng khách (HĐ của chính họ).
export const ADMIN_ONLY_GROUP_KEYS: string[] = ["hd_chu_nha"];
export function isAdminOnlyGroup(systemKey: string | null | undefined) {
  return !!systemKey && ADMIN_ONLY_GROUP_KEYS.indexOf(systemKey) >= 0;
}

export const DOC_STATUSES = ["approved", "pending", "signed", "reference"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  approved: "Đã duyệt",
  pending: "Chờ duyệt",
  signed: "Đã ký",
  reference: "Tham khảo",
};

// File CAD/nén chỉ để lưu trữ + tải về: không bao giờ bật khách xem.
export const CAD_EXTENSIONS = new Set(["dwg", "dxf", "dwf", "rvt", "skp", "zip", "rar", "7z"]);

export function fileExtension(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function isCadFile(fileName: string) {
  return CAD_EXTENSIONS.has(fileExtension(fileName));
}

export type DocGroupDto = {
  id: string;
  systemKey: string | null;
  name: string;
  icon: string;
  description: string | null;
  subfolders: string[];
  displayOrder: number;
  permEngineer: boolean;
  permAccountant: boolean;
  permSubcontractor: boolean;
  permCustomer: boolean;
};

export type ProjectDocDto = {
  id: string;
  title: string;
  category: ProjectDocumentCategory;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploader: { id: string; fullName: string };
  uploadedAt: string;
  visibleToCustomer: boolean;
  viewUrl: string;
  groupId: string | null;
  subfolder: string | null;
  status: string | null;
  accessMode: string;
  versionNo: number;
  rootId: string;
  isCurrent: boolean;
  grantedUsers?: Array<{ id: string; fullName: string; role: string }>;
};
