-- M6 — Weekly payroll

CREATE TYPE "WeeklyPayrollStatus" AS ENUM ('draft', 'ready_to_pay', 'paid');

CREATE TABLE "weekly_payrolls" (
    "id"                  UUID                  NOT NULL,
    "project_id"          UUID                  NOT NULL,
    "week_key"            TEXT                  NOT NULL,
    "week_start"          DATE                  NOT NULL,
    "week_end"            DATE                  NOT NULL,
    "status"              "WeeklyPayrollStatus" NOT NULL DEFAULT 'draft',
    "total_days"          DECIMAL(10, 2)        NOT NULL,
    "total_daily_wage"    BIGINT                NOT NULL,
    "total_output_value"  BIGINT                NOT NULL,
    "week_delta"          BIGINT                NOT NULL,
    "carryover_prev"      BIGINT                NOT NULL,
    "carryover_new"       BIGINT                NOT NULL,
    "bonus_pool"          BIGINT                NOT NULL,
    "share_rate"          DECIMAL(5, 4)         NOT NULL,
    "total_bonus"         BIGINT                NOT NULL,
    "total_payable"       BIGINT                NOT NULL,
    "neg_streak"          INTEGER               NOT NULL DEFAULT 0,
    "note"                TEXT,
    "closed_by_id"        UUID                  NOT NULL,
    "closed_at"           TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readied_by_id"       UUID,
    "readied_at"          TIMESTAMP(3),
    "paid_by_id"          UUID,
    "paid_at"             TIMESTAMP(3),
    "paid_note"           TEXT,
    "created_at"          TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)          NOT NULL,

    CONSTRAINT "weekly_payrolls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_payrolls_project_week_uq"
    ON "weekly_payrolls" ("project_id", "week_key");
CREATE INDEX "weekly_payrolls_project_status_idx"
    ON "weekly_payrolls" ("project_id", "status");

ALTER TABLE "weekly_payrolls"
    ADD CONSTRAINT "weekly_payrolls_project_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_payrolls"
    ADD CONSTRAINT "weekly_payrolls_closed_by_fk"
    FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "weekly_payrolls"
    ADD CONSTRAINT "weekly_payrolls_readied_by_fk"
    FOREIGN KEY ("readied_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "weekly_payrolls"
    ADD CONSTRAINT "weekly_payrolls_paid_by_fk"
    FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "weekly_payroll_lines" (
    "id"             UUID            NOT NULL,
    "payroll_id"     UUID            NOT NULL,
    "worker_id"      UUID            NOT NULL,
    "full_name"      TEXT            NOT NULL,
    "grade"          INTEGER,
    "bank_account"   TEXT,
    "bank_name"      TEXT,
    "phone"          TEXT,
    "total_days"     DECIMAL(10, 2)  NOT NULL,
    "daily_rate"     BIGINT          NOT NULL,
    "daily_wage"     BIGINT          NOT NULL,
    "bonus"          BIGINT          NOT NULL,
    "adjustment"     BIGINT          NOT NULL DEFAULT 0,
    "payable"        BIGINT          NOT NULL,
    "absent_p"       INTEGER         NOT NULL DEFAULT 0,
    "absent_kp"      INTEGER         NOT NULL DEFAULT 0,
    "absent_mua"     INTEGER         NOT NULL DEFAULT 0,
    "absent_cho"     INTEGER         NOT NULL DEFAULT 0,
    "note"           TEXT,
    "created_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_payroll_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weekly_payroll_lines_payroll_worker_uq"
    ON "weekly_payroll_lines" ("payroll_id", "worker_id");
CREATE INDEX "weekly_payroll_lines_worker_idx"
    ON "weekly_payroll_lines" ("worker_id");

ALTER TABLE "weekly_payroll_lines"
    ADD CONSTRAINT "weekly_payroll_lines_payroll_fk"
    FOREIGN KEY ("payroll_id") REFERENCES "weekly_payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_payroll_lines"
    ADD CONSTRAINT "weekly_payroll_lines_worker_fk"
    FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "weekly_payroll_adjustments" (
    "id"                  UUID         NOT NULL,
    "project_id"          UUID         NOT NULL,
    "worker_id"           UUID         NOT NULL,
    "applied_payroll_id"  UUID,
    "amount"              BIGINT       NOT NULL,
    "reason"              TEXT         NOT NULL,
    "created_by_id"       UUID         NOT NULL,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weekly_payroll_adjustments_project_worker_idx"
    ON "weekly_payroll_adjustments" ("project_id", "worker_id");
CREATE INDEX "weekly_payroll_adjustments_applied_idx"
    ON "weekly_payroll_adjustments" ("applied_payroll_id");

ALTER TABLE "weekly_payroll_adjustments"
    ADD CONSTRAINT "weekly_payroll_adjustments_project_fk"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_payroll_adjustments"
    ADD CONSTRAINT "weekly_payroll_adjustments_worker_fk"
    FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_payroll_adjustments"
    ADD CONSTRAINT "weekly_payroll_adjustments_applied_payroll_fk"
    FOREIGN KEY ("applied_payroll_id") REFERENCES "weekly_payrolls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "weekly_payroll_adjustments"
    ADD CONSTRAINT "weekly_payroll_adjustments_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
