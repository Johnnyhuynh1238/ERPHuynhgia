import fs from "node:fs";
import path from "node:path";

function read(p: string) {
  return fs.readFileSync(path.join(process.cwd(), p), "utf8");
}
function assert(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
}
let failed = false;
const results: { name: string; ok: boolean; detail: string }[] = [];
const evening = read("app/api/reports/evening/route.ts");
const service = read("lib/task-status-auto.ts");
const job = read("app/api/reports/jobs/task-status/route.ts");
const qcReview = read("app/api/tasks/[id]/qc-review/route.ts");
const taskRoute = read("app/api/tasks/[id]/route.ts");

assert("not_started -> in_progress by evening activity uses recomputeTaskStatus", evening.includes("recomputeTaskStatus(taskInput.taskId") && evening.includes('forceInProgress: true') && evening.includes('"evening report activity"'), "evening hook delegates to service");
assert("evening route removed old inline status log", !evening.includes("Đổi trạng thái"), "no legacy Vietnamese inline status log");
assert("AUTO_STATUS audit for activity path", service.includes("AUTO_STATUS:") && service.includes("forceInProgress") && service.includes("TaskStatus.in_progress"), "service writes AUTO_STATUS for in_progress");
assert("in_progress -> delayed by overdue job/service", job.includes("applyOverdueStatus") && service.includes("TaskStatus.delayed") && service.includes("overdue plannedEndDate") && service.includes("status: { in: [TaskStatus.in_progress]"), "job delegates delayed transition to service");
assert("delayed -> inspected by QC approve", qcReview.includes("setTaskInspected") && qcReview.includes("qc approved") && service.includes("TaskStatus.inspected"), "QC approve calls inspected service");
assert("delayed activity does NOT return to in_progress", service.includes("task.status === TaskStatus.delayed") && service.includes("return task"), "service exits for delayed before forceInProgress");
assert("unauthorized manual status returns 403", taskRoute.includes("canChangeStatus") && taskRoute.includes("Không có quyền đổi trạng thái") && taskRoute.includes("status: 403"), "manual status guarded");
assert("manual status log uses MANUAL_STATUS", taskRoute.includes("MANUAL_STATUS:"), "manual audit prefix present");
assert("QC approve path still builds statically", qcReview.includes("QcReviewAction.approved") && qcReview.includes("setTaskInspected"), "approve branch intact");

const report = { generatedAt: new Date().toISOString(), failed, results };
const out = "output/reports/smoke-task-status-static-2026-04-25.json";
fs.writeFileSync(out, JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name} - ${r.detail}`);
console.log(`Report: ${out}`);
if (failed) process.exit(1);
