import { UserRole } from "@prisma/client";

// Nghiệm thu ký giấy: KS/admin chụp BB đã ký + ảnh công trình, đính vào mốc.
// Cổng CN chỉ xem. Có ≥1 ảnh BB → mốc "Đã nghiệm thu" (status = signed).

export type AcceptancePhotoKind = "bien_ban" | "site";

export type AcceptancePhoto = {
  key: string;
  contentType: string;
  width: number | null;
  height: number | null;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

export const ACCEPTANCE_UPLOAD_ROLES = new Set<string>([
  UserRole.admin,
  UserRole.construction_manager,
  UserRole.engineer,
]);

export const ACCEPTANCE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// BB có thể là file scan PDF; ảnh công trình chỉ nhận ảnh.
export const ACCEPTANCE_BB_TYPES = [...ACCEPTANCE_IMAGE_TYPES, "application/pdf"];
export const ACCEPTANCE_MAX_BYTES = 25 * 1024 * 1024;
export const ACCEPTANCE_MAX_PER_KIND = 30;

export function parseAcceptanceKind(raw: string | null): AcceptancePhotoKind | null {
  return raw === "bien_ban" || raw === "site" ? raw : null;
}

export function acceptancePhotoField(kind: AcceptancePhotoKind) {
  return kind === "bien_ban" ? "bienBanPhotos" : "sitePhotos";
}

export function readAcceptancePhotos(value: unknown): AcceptancePhoto[] {
  return Array.isArray(value) ? (value as AcceptancePhoto[]) : [];
}

export function isPdfPhoto(p: { contentType: string }) {
  return p.contentType === "application/pdf";
}

// Tìm file trong mốc theo key — chặn đọc key tuỳ ý từ MinIO.
export function findAcceptancePhoto(
  milestone: { bienBanPhotos: unknown; sitePhotos: unknown },
  key: string,
): AcceptancePhoto | undefined {
  return [...readAcceptancePhotos(milestone.bienBanPhotos), ...readAcceptancePhotos(milestone.sitePhotos)].find(
    (p) => p.key === key,
  );
}
