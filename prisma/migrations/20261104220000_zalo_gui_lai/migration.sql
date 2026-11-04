-- Hàng chờ GỬI LẠI tin Zalo cho chủ nhà / đội khoán khi lần gửi bị lỗi (luật sếp 04/11/2026):
-- 3 lần cách 5 phút → báo TP Dự án – Thi công để theo dõi (không nhắn KS, không gửi tay) → mỗi giờ 1 lần tới khi gửi được.
CREATE TABLE IF NOT EXISTS "zalo_retries" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "ref_id" UUID NOT NULL,
    "ev" VARCHAR(40) NOT NULL,
    "project_id" UUID,
    "recipient" TEXT,
    "message" TEXT NOT NULL,
    "with_file" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "tries" INTEGER NOT NULL DEFAULT 1,
    "next_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "zalo_retries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "zalo_retries_status_next_at_idx" ON "zalo_retries"("status", "next_at");
CREATE INDEX IF NOT EXISTS "zalo_retries_kind_ref_id_idx" ON "zalo_retries"("kind", "ref_id");

-- BB chủ nhà đang chờ ký mà link mời ký chưa lần nào gửi tới khách (vd 2 BB DA-2026-006 ngày 03/11)
-- → đưa luôn vào hàng chờ. Nội dung tin máy soạn lại đúng mẫu lúc gửi (retryEsignPartySend).
INSERT INTO "zalo_retries" ("id", "kind", "ref_id", "ev", "project_id", "recipient", "message", "link", "tries", "next_at", "last_error", "created_at")
SELECT gen_random_uuid(), 'bb_party', e."id", 'party_link', e."project_id",
       TRIM('chủ nhà ' || COALESCE(e."party_name", '')), '(soạn lại lúc gửi)',
       'https://erp.huynhgia6.com/ky/' || e."party_token", 1, CURRENT_TIMESTAMP, 'bridge lỗi (trước khi có gửi lại)', COALESCE(e."ks_signed_at", CURRENT_TIMESTAMP)
FROM "acceptance_esigns" e
WHERE e."status" = 'cho_khach' AND e."kind" = 'chu_nha'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(e."log") x WHERE x->>'ev' LIKE 'party_link%' AND x->>'ok' = 'true'
  )
  AND NOT EXISTS (SELECT 1 FROM "zalo_retries" r WHERE r."ref_id" = e."id" AND r."status" = 'pending');
