import type { Metadata } from "next";
import { getKsTaskForm, KS_TASKS } from "@/lib/ks-daily-report";
import { HeadcountFormClient } from "./headcount-form";
import { EodFormClient } from "./eod-form";
import { BT_CSS } from "./styles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Huỳnh Gia · Nhiệm vụ KS", robots: { index: false, follow: false } };

/** Link nhiệm vụ KS gửi qua Zalo — không cần đăng nhập, token HMAC tự xác thực. */
export default async function KsTaskPage({ params }: { params: { token: string } }) {
  const form = await getKsTaskForm(params.token);

  if (!form) {
    return (
      <div className="bt-body">
        <style dangerouslySetInnerHTML={{ __html: BT_CSS }} />
        <div className="bt-wrap">
          <div className="bt-head">
            <div className="bt-eyebrow">Huỳnh Gia</div>
            <h1>Link không hợp lệ</h1>
            <div className="bt-sub">Anh mở lại đúng link Zalo công ty gửi hôm nay.</div>
          </div>
        </div>
      </div>
    );
  }

  const task = KS_TASKS[form.kind];
  return (
    <div className="bt-body">
      <style dangerouslySetInnerHTML={{ __html: BT_CSS }} />
      <div className="bt-wrap">
        <div className="bt-head">
          <div className="bt-eyebrow">Huỳnh Gia · {task.title}</div>
          <h1>Ngày {form.dateLabel}</h1>
          <div className="bt-sub">
            KS {form.ksName} · hạn {task.closeHour}:00
          </div>
        </div>

        {form.state === "open" ? (
          form.kind === "headcount" ? (
            <HeadcountFormClient token={params.token} rows={form.rows.map((r) => ({ id: r.id, projectName: r.projectName }))} />
          ) : (
            <EodFormClient
              token={params.token}
              rows={form.rows.map((r) => ({
                id: r.id,
                projectName: r.projectName,
                tasksDone: r.tasksDone,
                issues: r.issues,
                photoCount: r.photoCount,
                locked: r.locked,
              }))}
            />
          )
        ) : (
          <>
            <div className={`bt-banner ${form.state === "done" ? "ok" : "off"}`}>
              {form.state === "done" ? "✓ Đã lưu — link đã khoá" : `Link đã hết hạn (${task.closeHour}:00)`}
            </div>
            {form.kind === "headcount" ? (
              <div className="bt-card">
                {form.rows.map((r) => (
                  <div key={r.id} className="bt-row">
                    <span className="bt-name">{r.projectName}</span>
                    <b>{r.status === "done" && r.workerCount !== null ? `${r.workerCount} thợ` : "—"}</b>
                  </div>
                ))}
              </div>
            ) : (
              form.rows.map((r) => (
                <div key={r.id} className="eo-proj">
                  <h2>{r.projectName}</h2>
                  {r.status === "done" ? (
                    <>
                      <p className="eo-text">{r.tasksDone || "—"}</p>
                      {r.issues && <p className="eo-text" style={{ marginTop: 6 }}>⚠️ {r.issues}</p>}
                      <div className="eo-had">{r.photoCount} ảnh</div>
                    </>
                  ) : (
                    <div className="eo-lock">Không báo</div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
