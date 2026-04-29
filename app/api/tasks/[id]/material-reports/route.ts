import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { canReport } from "@/lib/task-centric";
import { prisma } from "@/lib/prisma";
import { getTaskProject, upsertMaterialReport } from "@/lib/task-report-service";
export async function GET(_: Request, { params }: { params: { id: string } }) { const reports = await prisma.taskMaterialReport.findMany({ where: { taskId: params.id }, orderBy: { reportDate: "desc" } }); return NextResponse.json({ reports }); }
export async function POST(req: Request, { params }: { params: { id: string } }) { try { const user = await getCurrentUser(); if (!user?.id || !user.role) return NextResponse.json({ message: "Unauthorized" }, { status: 401 }); const task = await getTaskProject(params.id); if (!task) return NextResponse.json({ message: "Task not found" }, { status: 404 }); if (!(await canReport(user.id, user.role as any, task.projectId, "material"))) return NextResponse.json({ message: "Forbidden" }, { status: 403 }); const report = await upsertMaterialReport(params.id, user.id, await req.json()); return NextResponse.json({ report }); } catch (e: any) { return NextResponse.json({ message: e.message || "Failed" }, { status: 500 }); }}
