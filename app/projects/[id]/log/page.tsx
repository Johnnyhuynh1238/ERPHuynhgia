import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ProjectLogClient } from "./_components/project-log-client";

const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  project: "Dự án",
  payment_schedule: "Lịch thanh toán",
  sub_contract: "Hợp đồng thầu phụ",
  sub_contract_file: "File HĐ thầu phụ",
  sub_contract_evaluation: "Đánh giá thầu phụ",
  sub_evaluation: "Đánh giá thầu phụ",
  sub_payment: "Thanh toán thầu phụ",
  project_member: "Thành viên",
  project_drawing: "Bản vẽ",
  project_document: "Hồ sơ",
  project_phase: "Giai đoạn",
  task: "Task",
  task_attachment: "File task",
  task_photo: "Ảnh task",
  task_material: "Vật tư task",
  task_qc_item: "Mục QC",
  task_qc_photo: "Ảnh QC",
  task_qc_log: "Check QC",
  task_qc_result: "Kết quả QC",
  task_log: "Nhật ký task",
  task_technical_report: "BC kỹ thuật",
  task_material_report: "BC vật tư",
  task_labor_report: "BC nhân công",
  task_equipment_report: "BC thiết bị",
  task_report_photo: "Ảnh báo cáo",
  customer_portal: "Cổng chủ nhà",
  design_photo_group: "Nhóm ảnh thiết kế",
  design_group: "Nhóm ảnh thiết kế",
  design_photo: "Ảnh thiết kế",
  site_rest_day: "Ngày nghỉ",
  customer_comment: "Phản hồi chủ nhà",
  other: "Khác",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Tạo",
  update: "Sửa",
  update_status: "Sửa trạng thái",
  update_dates: "Sửa thời gian",
  update_assignment: "Sửa phân công",
  update_customer_visibility: "Hiện/ẩn với chủ nhà",
  update_technical: "Sửa hồ sơ kỹ thuật",
  update_progress: "Cập nhật tiến độ",
  update_password: "Đổi mật khẩu",
  update_access: "Đổi quyền truy cập",
  update_deadline: "Sửa deadline",
  delete: "Xoá",
  cancel: "Huỷ",
  request: "Yêu cầu",
  note_updated: "Cập nhật ghi chú",
  approve: "Duyệt",
  reject: "Từ chối",
  mark_paid: "Đánh dấu đã thanh toán",
  mark_done: "Hoàn thành",
  internal_approve: "TPTC duyệt",
  qc_approve: "QC duyệt",
  qc_reject: "QC từ chối",
  qc_pass: "QC đạt",
  qc_unpass: "QC bỏ đạt",
  qc_submit: "Gửi báo cáo QC",
  request_payment: "Yêu cầu thanh toán",
  activate: "Kích hoạt",
  complete: "Hoàn thành",
  upload: "Upload",
  upsert: "Cập nhật",
  remove_file: "Xoá file",
  reset: "Reset",
  reset_token: "Reset token",
  restore: "Khôi phục",
  clone: "Clone",
  clone_source: "Là nguồn clone",
  reorder: "Sắp xếp lại",
  note: "Ghi chú",
  grant_access: "Cấp quyền",
  revoke_access: "Thu hồi quyền",
  other: "Khác",
};

type SearchParams = {
  page?: string;
  entity?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
};

export default async function ProjectLogPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  if (user.role !== UserRole.admin) redirect(`/projects/${params.id}?denied=log`);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!project) redirect("/projects?denied=1");

  const page = Math.max(1, Number(searchParams.page || 1));
  const entityFilter = (searchParams.entity || "").trim();
  const actionFilter = (searchParams.action || "").trim();
  const actorFilter = (searchParams.actor || "").trim();
  const fromRaw = (searchParams.from || "").trim();
  const toRaw = (searchParams.to || "").trim();

  const fromDate = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? new Date(`${fromRaw}T00:00:00+07:00`) : null;
  const toDate = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? new Date(`${toRaw}T23:59:59+07:00`) : null;

  const where = {
    projectId: params.id,
    ...(entityFilter ? { entity: entityFilter } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(actorFilter ? { actorId: actorFilter } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [total, rows, actors, entities, actions] = await Promise.all([
    prisma.projectActivityLog.count({ where }),
    prisma.projectActivityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.projectActivityLog.findMany({
      where: { projectId: params.id, actorId: { not: null } },
      distinct: ["actorId"],
      select: { actorId: true, actor: { select: { id: true, fullName: true, email: true } } },
      take: 200,
    }),
    prisma.projectActivityLog.findMany({
      where: { projectId: params.id },
      distinct: ["entity"],
      select: { entity: true },
      take: 100,
    }),
    prisma.projectActivityLog.findMany({
      where: { projectId: params.id },
      distinct: ["action"],
      select: { action: true },
      take: 100,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ProjectLogClient
      projectId={params.id}
      projectCode={project.code}
      projectName={project.name}
      page={page}
      totalPages={totalPages}
      total={total}
      rows={rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        entity: r.entity,
        entityLabel: ENTITY_LABELS[r.entity] ?? r.entity,
        action: r.action,
        actionLabel: ACTION_LABELS[r.action] ?? r.action,
        summary: r.summary,
        diff: (r.diff as Record<string, { from: unknown; to: unknown }> | null) ?? null,
        snapshot: r.snapshot ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        actor: r.actor
          ? { id: r.actor.id, name: r.actor.fullName || r.actor.email || "—" }
          : null,
      }))}
      actors={actors
        .filter((a) => Boolean(a.actorId && a.actor))
        .map((a) => ({ id: a.actor!.id, name: a.actor!.fullName || a.actor!.email || "—" }))}
      entities={entities.map((e) => ({ value: e.entity, label: ENTITY_LABELS[e.entity] ?? e.entity }))}
      actions={actions.map((a) => ({ value: a.action, label: ACTION_LABELS[a.action] ?? a.action }))}
      filters={{ entity: entityFilter, action: actionFilter, actor: actorFilter, from: fromRaw, to: toRaw }}
    />
  );
}
