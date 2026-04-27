"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const phoneVNRegex = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

const formSchema = z.object({
  customerName: z.string().trim().min(2, "Tên chủ nhà tối thiểu 2 ký tự"),
  customerPhone: z.string().trim().regex(phoneVNRegex, "SĐT chủ nhà không hợp lệ"),
  customerIdNumber: z.string().trim().optional().nullable(),
  address: z.string().trim().min(5, "Địa chỉ tối thiểu 5 ký tự"),
  name: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự"),
  areaM2: z.number().min(1, "Diện tích phải > 0").optional(),
  unitPrice: z.number().min(1_000_000, "Đơn giá tối thiểu 1.000.000").optional(),
  startDate: z.string().min(1, "Ngày khởi công là bắt buộc"),
  expectedEndDate: z.string().min(1, "Ngày bàn giao dự kiến là bắt buộc"),
  templateCategory: z.literal("nha_pho_1t1l"),
  projectManagerId: z.string().uuid("Vui lòng chọn GĐ Thi Công").optional(),
  mainEngineerId: z.string().uuid("Vui lòng chọn KS chính"),
  members: z.array(
    z.object({
      userId: z.string().uuid("Vui lòng chọn user"),
      roleInProject: z.enum(["engineer", "foreman", "accountant", "construction_manager"]),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

type OptionUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "0 đ";
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function todayPlusDaysIso(days: number) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return toIsoDate(now);
}

export function ProjectsNewForm({
  currentUserId,
  currentUserRole,
  currentUserName,
}: {
  currentUserId: string;
  currentUserRole: "admin" | "construction_manager";
  currentUserName: string;
}) {
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [admins, setAdmins] = useState<OptionUser[]>([]);
  const [engineers, setEngineers] = useState<OptionUser[]>([]);
  const [members, setMembers] = useState<OptionUser[]>([]);

  const isConstructionManager = currentUserRole === "construction_manager";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerIdNumber: "",
      address: "",
      name: "",
      areaM2: undefined,
      unitPrice: undefined,
      startDate: todayIso(),
      expectedEndDate: todayPlusDaysIso(120),
      templateCategory: "nha_pho_1t1l",
      projectManagerId: currentUserId,
      mainEngineerId: "",
      members: [],
    },
    mode: "onChange",
  });

  const membersFieldArray = useFieldArray({
    control: form.control,
    name: "members",
  });

  useEffect(() => {
    async function loadOptions() {
      const res = await fetch("/api/admin/users/options", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        admins?: OptionUser[];
        engineers?: OptionUser[];
        members?: OptionUser[];
        message?: string;
      };

      setLoadingOptions(false);

      if (!res.ok) {
        toast.error("Không tải được danh sách user", {
          description: data.message || "Vui lòng thử lại",
        });
        return;
      }

      setAdmins(data.admins || []);
      setEngineers(data.engineers || []);
      setMembers(data.members || []);

      if (isConstructionManager) {
        form.setValue("projectManagerId", currentUserId);
      } else if (!form.getValues("projectManagerId") && data.admins?.[0]) {
        form.setValue("projectManagerId", data.admins[0].id);
      }
    }

    loadOptions();
  }, [currentUserId, form, isConstructionManager]);

  const areaM2 = form.watch("areaM2");
  const unitPrice = form.watch("unitPrice");
  const selectedMembers = form.watch("members");

  const contractValue = useMemo(() => {
    const area = Number(areaM2 || 0);
    const price = Number(unitPrice || 0);
    return area * price;
  }, [areaM2, unitPrice]);

  const hasDuplicateMembers = useMemo(() => {
    const ids = selectedMembers.map((m) => m.userId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [selectedMembers]);

  const isSubmitDisabled = !form.formState.isValid || submitting || hasDuplicateMembers || loadingOptions;

  async function onSubmit(values: FormValues) {
    if (hasDuplicateMembers) {
      toast.error("Không được chọn trùng thành viên dự án");
      return;
    }

    setSubmitting(true);

    const payload = isConstructionManager
      ? {
          ...values,
          projectManagerId: currentUserId,
          areaM2: undefined,
          unitPrice: undefined,
          contractValue: null,
        }
      : values;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; code?: string; message?: string };

    setSubmitting(false);

    if (!res.ok || !data.id) {
      toast.error("Tạo dự án thất bại", {
        description: data.message || "Vui lòng kiểm tra dữ liệu đầu vào.",
      });
      return;
    }

    toast.success(data.message || `Đã tạo dự án ${data.code || ""}`);
    router.push(`/projects/${data.id}`);
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Section A - Thông tin chủ nhà</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tên chủ nhà *</label>
            <input className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("customerName")} />
            {form.formState.errors.customerName ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.customerName.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">SĐT chủ nhà *</label>
            <input className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("customerPhone")} />
            {form.formState.errors.customerPhone ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.customerPhone.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">CMND/CCCD (tuỳ chọn)</label>
            <input className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("customerIdNumber")} />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Địa chỉ công trình *</label>
          <textarea rows={2} className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("address")} />
          {form.formState.errors.address ? (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.address.message}</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Section B - Thông tin dự án</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tên dự án *</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Nhà anh/chị [Tên] - [Quận]"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Template *</label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("templateCategory")}>
              <option value="nha_pho_1t1l">Nhà phố 1T1L</option>
            </select>
          </div>

          {!isConstructionManager ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Diện tích quy đổi m2 *</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  {...form.register("areaM2", { valueAsNumber: true })}
                />
                {form.formState.errors.areaM2 ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.areaM2.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Đơn giá đồng/m2 *</label>
                <input
                  type="number"
                  min={1_000_000}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  {...form.register("unitPrice", { valueAsNumber: true })}
                />
                {form.formState.errors.unitPrice ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.unitPrice.message}</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Giá trị HĐ (readonly)</label>
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">{formatMoney(contractValue)}</div>
              </div>
            </>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium">Ngày khởi công *</label>
            <input type="date" className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("startDate")} />
            {form.formState.errors.startDate ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.startDate.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Ngày bàn giao dự kiến *</label>
            <input type="date" className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("expectedEndDate")} />
            {form.formState.errors.expectedEndDate ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.expectedEndDate.message}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Section C - Phân công</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">GĐ Thi Công *</label>
            {isConstructionManager ? (
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm font-medium">{currentUserName}</div>
            ) : (
              <select className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("projectManagerId")}>
                <option value="">Chọn GĐ Thi Công</option>
                {admins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            )}
            {form.formState.errors.projectManagerId ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.projectManagerId.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">KS chính *</label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" {...form.register("mainEngineerId")}>
              <option value="">Chọn KS chính</option>
              {engineers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
            {form.formState.errors.mainEngineerId ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.mainEngineerId.message}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Thành viên dự án (multi select)</h3>
            <Button
              type="button"
              variant="outline"
              onClick={() => membersFieldArray.append({ userId: "", roleInProject: "engineer" })}
            >
              + Thêm thành viên
            </Button>
          </div>

          {membersFieldArray.fields.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-slate-500">Chưa thêm thành viên.</div>
          ) : (
            membersFieldArray.fields.map((field, idx) => (
              <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_220px_auto]">
                <select className="rounded-md border px-3 py-2 text-sm" {...form.register(`members.${idx}.userId`)}>
                  <option value="">Chọn user</option>
                  {members.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>

                <select className="rounded-md border px-3 py-2 text-sm" {...form.register(`members.${idx}.roleInProject`)}>
                  <option value="engineer">engineer</option>
                  <option value="foreman">foreman</option>
                  <option value="accountant">accountant</option>
                  <option value="construction_manager">construction_manager</option>
                </select>

                <Button type="button" variant="outline" onClick={() => membersFieldArray.remove(idx)}>
                  Xóa
                </Button>
              </div>
            ))
          )}

          {hasDuplicateMembers ? <p className="text-xs text-red-600">Không được chọn trùng user trong thành viên dự án.</p> : null}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitDisabled} className="bg-orange-500 hover:bg-orange-600">
          {submitting ? "Đang tạo dự án..." : "Tạo dự án"}
        </Button>
      </div>
    </form>
  );
}
