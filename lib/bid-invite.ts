import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { notAdminOnlyGroupWhere } from "@/lib/project-doc-groups";
import { getObjectFromMinio } from "@/lib/minio";
import { companyDocFileName, fileExtension, isCompanyDocKey } from "@/lib/company-docs";

// Link mời thầu nhân công: <PUBLIC_SITE_URL>/moi-thau-<mã> (cùng đường nginx với link cổng khách → /mo-ta/<slug>).
// Nhà thầu chỉ XEM: mọi file (PDF bản vẽ, ảnh phối cảnh, HĐ mẫu) được chuyển thành ảnh JPEG từng trang
// có đóng dấu chìm, không bao giờ trả file gốc.

const run = promisify(execFile);

export const BID_SLUG_PREFIX = "moi-thau-";

export function newBidSlug() {
  return BID_SLUG_PREFIX + randomBytes(5).toString("hex");
}

export function isBidSlug(slug: string) {
  return /^moi-thau-[a-f0-9]{10}$/.test(slug);
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

// HĐ mẫu chọn từ Tài liệu chung: chỉ PDF / ảnh (docx, xlsx không hiển thị được dạng ảnh).
export function isBidViewableDoc(key: string) {
  if (!isCompanyDocKey(key)) return false;
  const ext = fileExtension(companyDocFileName(key));
  return ext === "pdf" || IMAGE_EXT.has(ext);
}

export function minioKey(url: string | null | undefined) {
  return url?.startsWith("minio://") ? url.slice("minio://".length) : null;
}

export type BidFile = { id: string; title: string; pages: number };

export type BidAssets = {
  drawings: BidFile[];
  photos: { id: string; caption: string }[];
  docs: BidFile[]; // id = chỉ số trong bidDocKeys
};

// ── Bộ nhớ đệm (mất khi khởi động lại container, đủ dùng) ─────────────────────
const pageCountCache = new Map<string, number>();
const imageCache = new Map<string, Buffer>();
let imageCacheBytes = 0;
const IMAGE_CACHE_MAX = 150 * 1024 * 1024;

function cacheGet(k: string) {
  const v = imageCache.get(k);
  if (v) {
    imageCache.delete(k);
    imageCache.set(k, v);
  }
  return v;
}

function cacheSet(k: string, v: Buffer) {
  imageCache.set(k, v);
  imageCacheBytes += v.length;
  while (imageCacheBytes > IMAGE_CACHE_MAX && imageCache.size > 1) {
    const first = imageCache.keys().next().value as string;
    imageCacheBytes -= imageCache.get(first)?.length || 0;
    imageCache.delete(first);
  }
}

// pdftoppm nặng CPU → tối đa 2 lượt cùng lúc.
let running = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => waiters.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiters.shift()?.();
  }
}

async function withTempPdf<T>(key: string, fn: (file: string, dir: string) => Promise<T>) {
  const { buffer } = await getObjectFromMinio(key);
  const dir = await mkdtemp(path.join(tmpdir(), "bid-"));
  const file = path.join(dir, "in.pdf");
  try {
    await writeFile(file, buffer);
    return await fn(file, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function pdfPageCount(key: string) {
  const hit = pageCountCache.get(key);
  if (hit) return hit;
  const n = await withTempPdf(key, async (file) => {
    const { stdout } = await run("pdfinfo", [file]);
    return Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] || 0);
  }).catch(() => 0);
  if (n > 0) pageCountCache.set(key, n);
  return n;
}

async function fileEntry(id: string, title: string, key: string | null): Promise<BidFile | null> {
  if (!key) return null;
  const ext = fileExtension(key);
  if (ext === "pdf") {
    const pages = await pdfPageCount(key);
    return pages ? { id, title, pages } : null;
  }
  return IMAGE_EXT.has(ext) ? { id, title, pages: 1 } : null;
}

// Bản vẽ = hồ sơ dự án thuộc nhóm bật quyền Thầu phụ (mặc định nhóm Bản vẽ) + file GĐ 4, phối cảnh = nhóm ảnh 3D, HĐ mẫu = Tài liệu chung đã chọn.
export async function loadBidAssets(projectId: string | null, docKeys: string[]): Promise<BidAssets> {
  const [docs, photos] = projectId
    ? await Promise.all([
        prisma.projectDocument.findMany({
          where: {
            projectId,
            isCurrent: true,
            OR: [{ accessMode: "group", group: { permSubcontractor: true } }, { designStep: { not: null } }],
            ...notAdminOnlyGroupWhere,
          },
          orderBy: [{ uploadedAt: "asc" }],
          select: { id: true, title: true, fileUrl: true },
        }),
        prisma.designPhoto.findMany({
          where: { group: { projectId, designStep: "phoi_canh" } },
          orderBy: [{ displayOrder: "asc" }, { uploadedAt: "asc" }],
          select: { id: true, caption: true },
        }),
      ])
    : [[], []];

  const drawings = await Promise.all(docs.map((d) => fileEntry(d.id, d.title, minioKey(d.fileUrl))));
  const contract = await Promise.all(
    docKeys.map((k, i) =>
      isBidViewableDoc(k) ? fileEntry(String(i), companyDocFileName(k).replace(/\.[a-z0-9]+$/i, ""), k) : null,
    ),
  );
  return {
    drawings: drawings.filter((x): x is BidFile => Boolean(x)),
    photos: photos.map((p) => ({ id: p.id, caption: p.caption || "" })),
    docs: contract.filter((x): x is BidFile => Boolean(x)),
  };
}

function watermarkSvg(w: number, h: number) {
  const fs = Math.max(18, Math.round(Math.min(w, h) / 28));
  const gapX = fs * 24;
  const gapY = fs * 7;
  const rows: string[] = [];
  const diag = Math.ceil(Math.hypot(w, h));
  for (let y = -diag; y < diag; y += gapY) {
    for (let x = -diag + ((y / gapY) % 2 ? gapX / 2 : 0); x < diag; x += gapX) {
      rows.push(`<text x="${x}" y="${y}">HUỲNH GIA · MỜI THẦU · CHỈ XEM</text>`);
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="translate(${w / 2} ${h / 2}) rotate(-28)" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fs}" fill="#a3471c" fill-opacity="0.13">${rows.join("")}</g></svg>`,
  );
}

async function stamp(input: Buffer, maxSide: number) {
  const img = sharp(input, { limitInputPixels: 400_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" });
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return sharp(data)
    .composite([{ input: watermarkSvg(info.width, info.height) }])
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
}

// Ảnh JPEG có dấu chìm của 1 trang file MinIO (PDF → trang `page`, ảnh → chính nó).
export async function renderBidImage(key: string, page: number, maxSide: number) {
  const ck = `${key}#${page}#${maxSide}`;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const out = await withSlot(async () => {
    if (fileExtension(key) === "pdf") {
      return withTempPdf(key, async (file, dir) => {
        await run(
          "pdftoppm",
          ["-f", String(page), "-l", String(page), "-r", "150", "-scale-to", String(maxSide), "-png", "-singlefile", file, path.join(dir, "out")],
          { timeout: 60_000 },
        );
        return stamp(await readFile(path.join(dir, "out.png")), maxSide);
      });
    }
    const { buffer } = await getObjectFromMinio(key);
    return stamp(buffer, maxSide);
  });
  cacheSet(ck, out);
  return out;
}
