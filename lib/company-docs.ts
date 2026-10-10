import { randomUUID } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMinioBucket, getMinioClient } from "@/lib/minio";

// Tài liệu chung công ty — lưu thẳng MinIO prefix company-docs/ (KHÔNG bảng DB).
// Key: company-docs/<uuid>/<tên file gốc>, hoặc trong thư mục (nhánh):
//      company-docs/<thư mục>/<uuid>/<tên file gốc> → tên hiển thị lấy từ đoạn cuối key.

export const COMPANY_DOCS_PREFIX = "company-docs/";
export const COMPANY_DOCS_MAX_BYTES = 50 * 1024 * 1024;
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
  return (parts.length === 3 || parts.length === 4) && parts.every(Boolean);
}

export function companyDocFileName(key: string) {
  return key.split("/").pop() || "tai-lieu";
}

export function companyDocFolder(key: string) {
  const parts = key.split("/");
  return parts.length === 4 ? parts[1] : "";
}

// Tên thư mục: bỏ "/", ký tự điều khiển, gộp khoảng trắng. Rỗng = ngoài thư mục.
export function cleanFolderName(raw: string) {
  return raw.replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/\.{2,}/g, ".").replace(/^\.+/, "").trim().slice(0, 80);
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

export async function listCompanyDocs(): Promise<CompanyDoc[]> {
  const client = getMinioClient();
  const bucket = getMinioBucket();
  const docs: CompanyDoc[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: COMPANY_DOCS_PREFIX, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key || !isCompanyDocKey(o.Key)) continue;
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
  return docs.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
}
