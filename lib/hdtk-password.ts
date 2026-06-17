import { createHmac } from "crypto";

export function currentHdtkPassword(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const secret = (process.env.HDTK_PDF_SECRET || "").trim();
  if (secret) {
    const mac = createHmac("sha256", secret).update(`${mm}${yy}`).digest("hex").slice(0, 4);
    return `Huynh${mac}Gia`;
  }
  return `Huynh${mm}${yy}Gia`;
}

export function nextRotationDate(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
