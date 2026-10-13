import { randomUUID } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMinioBucket, getMinioClient } from "@/lib/minio";

// Tài liệu chung công ty — lưu thẳng MinIO prefix company-docs/ (KHÔNG bảng DB).
// Key: company-docs/<uuid>/<tên file gốc>, hoặc trong thư mục (nhánh, tối đa 2 cấp):
//      company-docs/<thư mục>/<uuid>/<tên file gốc>
//      company-docs/<thư mục>/<thư mục con>/<uuid>/<tên file gốc> → tên hiển thị lấy từ đoạn cuối key.
// Đường dẫn thư mục dạng "Cha/Con".
// Thư mục rỗng: MinIO ko có thư mục thật → giữ bằng object đánh dấu company-docs/<thư mục>/.folder.

export const COMPANY_DOCS_PREFIX = "company-docs/";
export const COMPANY_DOCS_MAX_BYTES = 50 * 1024 * 1024;
export const COMPANY_DOCS_FOLDER_MARKER = ".folder";
export const COMPANY_DOCS_MAX_DEPTH = 2;
export const COMPANY_DOCS_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "webp"]);

export type CompanyDoc = {
  key: string;
  folder: string;
  fileName: string;
  ext: string;
  size: number;
  uploadedAt: string | null;
};

export function fileExtension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

// Chặn key ngoài prefix / path traversal khi client gửi key lên.
export function isCompanyDocKey(key: string) {
  if (!key.startsWith(COMPANY_DOCS_PREFIX) || key.includes("..")) return false;
  const parts = key.split("/");
  if (parts[parts.length - 1] === COMPANY_DOCS_FOLDER_MARKER) return false;
  return parts.length >= 3 && parts.length <= 3 + COMPANY_DOCS_MAX_DEPTH && parts.every(Boolean);
}

export function companyDocFileName(key: string) {
  return key.split("/").pop() || "tai-lieu";
}

export function companyDocFolder(key: string) {
  return key.split("/").slice(1, -2).join("/");
}

// Tên 1 cấp thư mục: bỏ "/", ký tự điều khiển, gộp khoảng trắng.
function cleanFolderSegment(raw: string) {
  return raw.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/\.{2,}/g, ".").replace(/^\.+/, "").trim().slice(0, 80);
}

// Đường dẫn thư mục "Cha/Con": làm sạch từng cấp, bỏ cấp rỗng, cắt còn tối đa 2 cấp. Rỗng = ngoài thư mục.
export function cleanFolderName(raw: string) {
  return raw.split("/").map(cleanFolderSegment).filter(Boolean).slice(0, COMPANY_DOCS_MAX_DEPTH).join("/");
}

// "Cha/Con" → ["Cha", "Cha/Con"]: mọi cấp cha của 1 thư mục (để thư mục cha luôn hiện).
export function folderWithParents(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function companyFolderMarkerKey(folder: string) {
  const dir = cleanFolderName(folder);
  return dir ? `${COMPANY_DOCS_PREFIX}${dir}/${COMPANY_DOCS_FOLDER_MARKER}` : "";
}

export function buildCompanyDocKey(originalName: string, folder = "") {
  const clean = originalName.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 160) || "tai-lieu";
  const dir = cleanFolderName(folder);
  return `${COMPANY_DOCS_PREFIX}${dir ? `${dir}/` : ""}${randomUUID()}/${clean}`;
}

// Chuyển tài liệu sang thư mục khác (copy rồi xoá key cũ) → trả key mới.
export async function moveCompanyDoc(key: string, folder: string) {
  const parts = key.split("/");
  const id = parts[parts.length - 2];
  const dir = cleanFolderName(folder);
  const newKey = `${COMPANY_DOCS_PREFIX}${dir ? `${dir}/` : ""}${id}/${companyDocFileName(key)}`;
  if (newKey === key) return key;
  const client = getMinioClient();
  const bucket = getMinioBucket();
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: newKey,
      CopySource: `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
    }),
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return newKey;
}

// Trả file + danh sách thư mục (gồm cả thư mục rỗng chỉ có object đánh dấu).
export async function listCompanyDocs(): Promise<{ docs: CompanyDoc[]; folders: string[] }> {
  const client = getMinioClient();
  const bucket = getMinioBucket();
  const docs: CompanyDoc[] = [];
  const folders = new Set<string>();
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: COMPANY_DOCS_PREFIX, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      const parts = o.Key.split("/");
      if (parts[parts.length - 1] === COMPANY_DOCS_FOLDER_MARKER) {
        const dir = parts.slice(1, -1);
        if (dir.length >= 1 && dir.length <= COMPANY_DOCS_MAX_DEPTH && dir.every(Boolean)) {
          folderWithParents(dir.join("/")).forEach((f) => folders.add(f));
        }
        continue;
      }
      if (!isCompanyDocKey(o.Key)) continue;
      folderWithParents(companyDocFolder(o.Key)).forEach((f) => folders.add(f));
      const fileName = companyDocFileName(o.Key);
      docs.push({
        key: o.Key,
        folder: companyDocFolder(o.Key),
        fileName,
        ext: fileExtension(fileName),
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ? o.LastModified.toISOString() : null,
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return {
    docs: docs.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || "")),
    folders: Array.from(folders),
  };
}
