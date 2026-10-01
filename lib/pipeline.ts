// Dự án theo tiến độ 6 giai đoạn — hằng số + helper dùng chung client/server.

export const PIPELINE_STAGES = ["Mô tả", "Báo giá", "Hợp đồng", "Thiết kế", "Thi công", "Bàn giao"];

// Trang mô tả gửi khách: <PUBLIC_SITE_URL>/<slug> (nginx huynhgia6.com proxy về ERP /mo-ta/<slug>).
export const PUBLIC_SITE_URL = "https://huynhgia6.com";

// Slug trùng thư mục/đường dẫn có sẵn trên huynhgia6.com → nginx phục vụ file thật trước, link khách sẽ sai.
const RESERVED_SLUGS = [
  "bao-gia",
  "don-gia",
  "admin-baogia",
  "mobile-assets",
  "wp-admin",
  "wp-content",
  "wp-includes",
  "wp-login",
  "du-toan-ngan",
  "du-an-ngan",
  "mo-ta",
];

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// null = hợp lệ; ngược lại trả lý do. Bắt buộc có ít nhất 1 dấu gạch (khớp regex nginx).
export function validateSlug(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(slug)) {
    return "Link chỉ gồm chữ thường không dấu, số, dấu gạch và phải có ít nhất 2 từ (vd: nha-anh-bin)";
  }
  if (slug.length > 60) return "Link quá dài (tối đa 60 ký tự)";
  if (RESERVED_SLUGS.indexOf(slug) >= 0) return "Link này trùng trang có sẵn trên website, chọn tên khác";
  return null;
}

export function pipelinePublicUrl(slug: string): string {
  return `${PUBLIC_SITE_URL}/${slug}`;
}
