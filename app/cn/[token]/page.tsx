import { redirect } from "next/navigation";
import { CustomerPortalLoginForm } from "./_components/customer-portal-login-form";
import { requirePortalPageAccess } from "@/lib/customer-portal";

export default async function CustomerPortalRootPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { expired?: string };
}) {
  const { project, session, state } = await requirePortalPageAccess(params.token);

  if (!project || state === "not_found") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <div className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#d9def3]">
          Liên kết không hợp lệ.
        </div>
      </div>
    );
  }

  if (state === "expired" || searchParams?.expired === "1") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <div className="w-full rounded-xl border border-amber-500/30 bg-[#1a1d2e] p-6 text-center text-sm text-amber-200">
          Liên kết đã hết hạn. Vui lòng liên hệ Huỳnh Gia để được hỗ trợ.
        </div>
      </div>
    );
  }

  if (state === "disabled") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <div className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#d9def3]">
          Cổng chủ nhà đang tạm ngưng. Vui lòng liên hệ Huỳnh Gia để được hỗ trợ.
        </div>
      </div>
    );
  }

  if (session) {
    redirect(`/cn/${params.token}/dashboard`);
  }

  return <CustomerPortalLoginForm token={params.token} customerName={project.customerName} />;
}
