import { randomUUID } from "node:crypto";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getMinioBucket, getMinioClient } from "@/lib/minio";

// Tài liệu chung công ty — lưu thẳng MinIO prefix company-docs/ (KHÔNG bảng DB).
// Key: company-docs/<uuid>/<tên file gốc> → tên hiển thị lấy từ đoạn cuối key.

export const COMPANY_DOCS_PREFIX = "company-docs/";
export const COMPANY_DOCS_MAX_BYTES = 50 * 1024 * 1024;
export const COMPANY_DOCS_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "webp"]);

export type CompanyDoc = {
  key: string;
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
  return key.startsWith(COMPANY_DOCS_PREFIX) && !key.includes("..") && key.split("/").length === 3;
}

export function companyDocFileName(key: string) {
  return key.split("/").pop() || "tai-lieu";
}

export function buildCompanyDocKey(originalName: string) {
  const clean = originalName.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 160) || "tai-lieu";
  return `${COMPANY_DOCS_PREFIX}${randomUUID()}/${clean}`;
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
