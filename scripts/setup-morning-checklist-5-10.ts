import bcrypt from "bcryptjs";
import { Pool } from "pg";

function formatYmd(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Thiếu DATABASE_URL");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const userEmail = "ks.phase15.test@congty.vn";
    const newPasswordHash = await bcrypt.hash("StrongP@ss9", 12);

    const userRow = await client.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           is_active = true,
           role = 'engineer'
       WHERE email = $2
       RETURNING id, email`,
      [newPasswordHash, userEmail],
    );

    if (!userRow.rowCount) {
      throw new Error(`Không tìm thấy user ${userEmail}`);
    }

    const projectRow = await client.query(`SELECT id, code FROM projects WHERE code = 'DA-2026-DEMO'`);
    if (!projectRow.rowCount) {
      throw new Error("Không tìm thấy dự án DA-2026-DEMO");
    }

    const projectId = projectRow.rows[0].id as string;
    const reporterId = userRow.rows[0].id as string;

    const todayUtc = new Date();
    const reportDateBase = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate(), 0, 0, 0));
    const reportDate = addUtcDays(reportDateBase, 1);

    const dMinus3 = formatYmd(addUtcDays(reportDate, -3));
    const dMinus2 = formatYmd(addUtcDays(reportDate, -2));
    const dMinus1 = formatYmd(addUtcDays(reportDate, -1));
    const d0 = formatYmd(reportDate);
    const dPlus1 = formatYmd(addUtcDays(reportDate, 1));
    const dPlus2 = formatYmd(addUtcDays(reportDate, 2));
    const reportDateYmd = formatYmd(reportDate);

    await client.query(`DELETE FROM site_rest_days WHERE project_id = $1 AND rest_date = $2::date`, [projectId, reportDateYmd]);

    await client.query(
      `DELETE FROM morning_report_tasks
       WHERE morning_report_id IN (
         SELECT id FROM morning_reports WHERE project_id = $1 AND reporter_id = $2 AND report_date = $3::date
       )`,
      [projectId, reporterId, reportDateYmd],
    );

    await client.query(
      `DELETE FROM morning_reports WHERE project_id = $1 AND reporter_id = $2 AND report_date = $3::date`,
      [projectId, reporterId, reportDateYmd],
    );

    await client.query(`UPDATE tasks SET status = 'inspected' WHERE project_id = $1 AND code = '98.03'`, [projectId]);

    await client.query(
      `UPDATE tasks
       SET status = 'in_progress', planned_start_date = $1::date, planned_end_date = $2::date, actual_start_date = $3::date, actual_end_date = NULL
       WHERE project_id = $4 AND code = '3.01'`,
      [dMinus1, d0, dMinus1, projectId],
    );

    await client.query(
      `UPDATE tasks
       SET status = 'in_progress', planned_start_date = $1::date, planned_end_date = $2::date, actual_start_date = $3::date, actual_end_date = NULL
       WHERE project_id = $4 AND code = '3.02'`,
      [d0, dPlus1, d0, projectId],
    );

    await client.query(
      `UPDATE tasks
       SET status = 'in_progress', planned_start_date = $1::date, planned_end_date = $2::date, actual_start_date = $3::date, actual_end_date = NULL
       WHERE project_id = $4 AND code = '3.03'`,
      [dMinus2, dPlus2, dMinus2, projectId],
    );

    await client.query(
      `UPDATE tasks
       SET status = 'in_progress', planned_start_date = $1::date, planned_end_date = $2::date, actual_start_date = $3::date, actual_end_date = NULL
       WHERE project_id = $4 AND code = '3.05'`,
      [dMinus3, dMinus1, dMinus3, projectId],
    );

    await client.query(
      `UPDATE tasks
       SET status = 'in_progress', planned_start_date = $1::date, planned_end_date = $2::date, actual_start_date = $3::date, actual_end_date = NULL
       WHERE project_id = $4 AND code = '4.01'`,
      [dMinus1, dPlus1, dMinus1, projectId],
    );

    const verifyRows = await client.query(
      `SELECT code, phase, status, planned_start_date, planned_end_date
       FROM tasks
       WHERE project_id = $1 AND code IN ('3.01', '3.02', '3.03', '3.05', '4.01')
       ORDER BY code`,
      [projectId],
    );

    console.log(
      JSON.stringify(
        {
          projectId,
          reportDate: reportDateYmd,
          reporterId,
          loginUser: userEmail,
          loginPassword: "StrongP@ss9",
          verifyTasks: verifyRows.rows,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
