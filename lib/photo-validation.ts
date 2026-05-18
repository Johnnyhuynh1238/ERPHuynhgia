import { createHash } from "node:crypto";
import exifr from "exifr";

const VN_OFFSET = "+07:00";

export const PROGRESS_PHOTO_MAX_AGE_MS = 30 * 60 * 1000;

function parseExifDate(raw: string, offset: string): Date | null {
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function readPhotoTakenAt(buffer: Buffer): Promise<Date | null> {
  try {
    const parsed = (await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "OffsetTimeOriginal", "OffsetTime"],
      reviveValues: false,
    })) as { DateTimeOriginal?: string; OffsetTimeOriginal?: string; OffsetTime?: string } | undefined;

    if (!parsed?.DateTimeOriginal) return null;

    const offset = parsed.OffsetTimeOriginal || parsed.OffsetTime || VN_OFFSET;
    return parseExifDate(parsed.DateTimeOriginal, offset);
  } catch {
    return null;
  }
}

export type FreshnessResult =
  | { ok: true; takenAt: Date }
  | { ok: false; reason: "no_exif" | "too_old" | "future"; takenAt: Date | null; message: string };

export async function validateProgressPhotoFreshness(
  buffer: Buffer,
  fileName: string,
  maxAgeMs = PROGRESS_PHOTO_MAX_AGE_MS,
): Promise<FreshnessResult> {
  const takenAt = await readPhotoTakenAt(buffer);

  if (!takenAt) {
    return {
      ok: false,
      reason: "no_exif",
      takenAt: null,
      message: `Ảnh "${fileName}" không có thông tin thời điểm chụp. Phải chụp trực tiếp tại hiện trường, không dùng ảnh edit/screenshot.`,
    };
  }

  const now = Date.now();
  const diff = now - takenAt.getTime();

  if (diff < -2 * 60 * 1000) {
    return {
      ok: false,
      reason: "future",
      takenAt,
      message: `Ảnh "${fileName}" có thời gian chụp trong tương lai — kiểm tra lại đồng hồ điện thoại.`,
    };
  }

  if (diff > maxAgeMs) {
    const minutes = Math.round(diff / 60000);
    return {
      ok: false,
      reason: "too_old",
      takenAt,
      message: `Ảnh "${fileName}" chụp cách đây ${minutes} phút (>30 phút). Phải chụp ảnh trực tiếp tại hiện trường, không upload ảnh có sẵn.`,
    };
  }

  return { ok: true, takenAt };
}

export function hashPhotoBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
