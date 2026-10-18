import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getMinioBucket, getMinioClient } from "@/lib/minio";

// Hồ sơ PDF GĐ chuẩn bị (dự toán, ngân sách ban đầu, HD mua hàng, HD giám sát) = file thô làm tay,
// không nối số liệu. 1 file / mục / dự án tại prep-docs/<projectId>/<step>.pdf (đặt thẳng vào MinIO) — không có bảng DB.
// Thầu phụ không ở đây: đọc file HĐ ở sub_contract_files.
export const PREP_DOC_STEPS = ["du_toan", "ngan_sach", "hd_mua_hang", "hd_giam_sat"] as const;
export type PrepDocStep = (typeof PREP_DOC_STEPS)[number];
export const isPrepDocStep = (s: string): s is PrepDocStep => (PREP_DOC_STEPS as readonly string[]).includes(s);

export const prepDocKey = (projectId: string, step: PrepDocStep) => `prep-docs/${projectId}/${step}.pdf`;

// Ngày tải lên của từng hồ sơ (ISO) — mục chưa có file thì không có key.
export async function listPrepDocs(projectId: string): Promise<Record<string, string>> {
  const client = getMinioClient();
  const Bucket = getMinioBucket();
  const out: Record<string, string> = {};
  await Promise.all(
    PREP_DOC_STEPS.map(async (step) => {
      try {
        const h = await client.send(new HeadObjectCommand({ Bucket, Key: prepDocKey(projectId, step) }));
        out[step] = (h.LastModified ?? new Date()).toISOString();
      } catch {
        /* chưa có file */
      }
    }),
  );
  return out;
}
