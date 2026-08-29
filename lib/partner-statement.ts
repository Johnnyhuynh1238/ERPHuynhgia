import { prisma } from "@/lib/prisma";

// Bảng đối chiếu công nợ ĐỐI TÁC (trang công khai /doi-tac/[token]).
// Gom MỌI dự án, tách nhóm theo dự án. Chỉ đọc — dùng để 2 bên chốt sổ.
//
// Nguồn số liệu (đúng bằng nguồn ERP đang dùng, khớp sổ quỹ):
//  - NCC       : nợ = Σ đơn mua status='received' có supplier; trả = Σ ncc_thanh_toan.
//  - Thầu phụ  : nợ = Σ giá trị hợp đồng (active/completed);
//                trả = Σ lệnh chi status='paid' gắn HĐ (source_type='sub_contract').

export type StatementLine = {
  date: Date | null;
  label: string;
  sub: string | null;
  amount: number;
};

export type StatementProject = {
  projectId: string;
  projectCode: string;
  projectName: string;
  debit: number; // phát sinh (nợ)
  credit: number; // đã thanh toán
  balance: number;
  debitLines: StatementLine[];
  creditLines: StatementLine[];
};

export type PartnerStatement = {
  kind: "supplier" | "subcontractor";
  name: string;
  code: string;
  phone: string | null;
  totals: { debit: number; credit: number; balance: number };
  projects: StatementProject[];
  generatedAt: Date;
};

const num = (v: unknown) => Number(v ?? 0);

function emptyProject(id: string, code: string, name: string): StatementProject {
  return { projectId: id, projectCode: code, projectName: name, debit: 0, credit: 0, balance: 0, debitLines: [], creditLines: [] };
}

/** Tìm đối tác theo token công khai. Trả null nếu token sai → trang 404. */
export async function findPartnerByToken(token: string) {
  if (!token || token.length < 10) return null;
  const supplier = await prisma.supplier.findUnique({
    where: { publicToken: token },
    select: { id: true, code: true, name: true, phone: true },
  });
  if (supplier) return { kind: "supplier" as const, ...supplier };

  const sub = await prisma.subcontractor.findUnique({
    where: { publicToken: token },
    select: { id: true, code: true, name: true, phone: true },
  });
  if (sub) return { kind: "subcontractor" as const, ...sub };

  return null;
}

export async function buildPartnerStatement(partner: {
  kind: "supplier" | "subcontractor";
  id: string;
  code: string;
  name: string;
  phone: string | null;
}): Promise<PartnerStatement> {
  const byProject = new Map<string, StatementProject>();
  const ensure = async (projectId: string | null, cache: Map<string, { code: string; name: string }>) => {
    const key = projectId ?? "__none__";
    if (!byProject.has(key)) {
      const meta = projectId ? cache.get(projectId) : undefined;
      byProject.set(key, emptyProject(key, meta?.code ?? "—", meta?.name ?? "Không gắn dự án"));
    }
    return byProject.get(key)!;
  };

  const projectCache = new Map<string, { code: string; name: string }>();
  const loadProjects = async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter((x) => x && !projectCache.has(x))));
    if (!missing.length) return;
    const rows = await prisma.project.findMany({
      where: { id: { in: missing } },
      select: { id: true, code: true, name: true },
    });
    for (const r of rows) projectCache.set(r.id, { code: r.code, name: r.name });
  };

  if (partner.kind === "supplier") {
    const orders = await prisma.mhOrder.findMany({
      where: { supplierId: partner.id, status: "received" },
      select: { id: true, seq: true, projectId: true, orderDate: true, deliveryDate: true, total: true, note: true },
      orderBy: { orderDate: "asc" },
    });
    const payRows = await prisma.$queryRaw<Array<{ project_id: string | null; so_tien: string; ngay: Date; ghi_chu: string | null }>>`
      SELECT project_id, so_tien, ngay, ghi_chu
      FROM ncc_thanh_toan WHERE supplier_id = ${partner.id}::uuid ORDER BY ngay ASC`;

    await loadProjects([
      ...orders.map((o) => o.projectId).filter((x): x is string => Boolean(x)),
      ...payRows.map((p) => p.project_id).filter((x): x is string => Boolean(x)),
    ]);

    for (const o of orders) {
      const g = await ensure(o.projectId, projectCache);
      const amount = num(o.total);
      g.debit += amount;
      g.debitLines.push({
        date: o.deliveryDate ?? o.orderDate,
        label: `Đơn hàng #${o.seq}`,
        sub: o.note?.trim() || null,
        amount,
      });
    }
    for (const p of payRows) {
      const g = await ensure(p.project_id, projectCache);
      const amount = num(p.so_tien);
      g.credit += amount;
      g.creditLines.push({ date: p.ngay, label: "Thanh toán", sub: p.ghi_chu?.trim() || null, amount });
    }
  } else {
    const contracts = await prisma.subContract.findMany({
      where: { subcontractorId: partner.id, status: { in: ["active", "completed"] } },
      select: { id: true, code: true, title: true, projectId: true, contractValue: true, startDate: true },
      orderBy: { startDate: "asc" },
    });
    await loadProjects(contracts.map((c) => c.projectId));

    for (const c of contracts) {
      const g = await ensure(c.projectId, projectCache);
      const amount = num(c.contractValue);
      g.debit += amount;
      g.debitLines.push({ date: c.startDate, label: `HĐ ${c.code}`, sub: c.title, amount });
    }

    const contractIds = contracts.map((c) => c.id);
    if (contractIds.length) {
      const paid = await prisma.expense.findMany({
        where: { sourceType: "sub_contract", sourceId: { in: contractIds }, status: "paid" },
        select: { code: true, sourceId: true, paidAmount: true, amount: true, paidAt: true, createdAt: true, note: true },
        orderBy: { paidAt: "asc" },
      });
      const projectByContract = new Map(contracts.map((c) => [c.id, c.projectId]));
      for (const e of paid) {
        const g = await ensure(e.sourceId ? projectByContract.get(e.sourceId) ?? null : null, projectCache);
        const amount = num(e.paidAmount ?? e.amount);
        g.credit += amount;
        g.creditLines.push({
          date: e.paidAt ?? e.createdAt,
          label: `Thanh toán ${e.code}`,
          sub: e.note?.trim() || null,
          amount,
        });
      }
    }
  }

  const projects = Array.from(byProject.values())
    .map((p) => {
      p.balance = p.debit - p.credit;
      p.debitLines.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
      p.creditLines.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
      return p;
    })
    .filter((p) => p.debit > 0 || p.credit > 0)
    .sort((a, b) => b.balance - a.balance);

  const totals = projects.reduce(
    (s, p) => ({ debit: s.debit + p.debit, credit: s.credit + p.credit, balance: s.balance + p.balance }),
    { debit: 0, credit: 0, balance: 0 },
  );

  return {
    kind: partner.kind,
    name: partner.name,
    code: partner.code,
    phone: partner.phone,
    totals,
    projects,
    generatedAt: new Date(),
  };
}
