import { randomUUID } from "node:crypto";
import { putObjectToMinio } from "@/lib/minio";

export const ATTENDANCE_MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
export const ATTENDANCE_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function getWorkDateVn(now: Date = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
}

function extFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  return "jpg";
}

export async function uploadAttendanceSelfie(args: {
  userId: string;
  kind: "in" | "out";
  file: File;
}) {
  const { userId, kind, file } = args;
  if (!ATTENDANCE_ALLOWED_MIME.has(file.type)) {
    throw new Error("INVALID_MIME");
  }
  if (file.size <= 0) throw new Error("EMPTY_FILE");
  if (file.size > ATTENDANCE_MAX_PHOTO_BYTES) throw new Error("FILE_TOO_LARGE");

  const ymd = getWorkDateVn().toISOString().slice(0, 10);
  const id = randomUUID();
  const ext = extFromMime(file.type);
  const key = `attendance/${userId}/${ymd}/${kind}_${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await putObjectToMinio({ key, body: buffer, contentType: file.type });
  return key;
}

export function parseLatLng(formData: FormData) {
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const accRaw = formData.get("accuracy");
  const lat = typeof latRaw === "string" && latRaw.length ? Number(latRaw) : null;
  const lng = typeof lngRaw === "string" && lngRaw.length ? Number(lngRaw) : null;
  const accuracy = typeof accRaw === "string" && accRaw.length ? Number(accRaw) : null;
  return {
    lat: Number.isFinite(lat as number) ? (lat as number) : null,
    lng: Number.isFinite(lng as number) ? (lng as number) : null,
    accuracy: Number.isFinite(accuracy as number) ? (accuracy as number) : null,
  };
}
