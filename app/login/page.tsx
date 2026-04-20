import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./_components/login-form";

type LoginPageProps = {
  searchParams?: {
    callbackUrl?: string;
    error?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  const callbackUrl = searchParams?.callbackUrl || "/";
  const hasCredentialError = searchParams?.error === "CredentialsSignin";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-[#1F4E79]">Đăng nhập ERP Huỳnh Gia</h1>
        <p className="mb-6 text-sm text-slate-500">Nhập email và mật khẩu để vào hệ thống.</p>

        <LoginForm callbackUrl={callbackUrl} hasCredentialError={hasCredentialError} />
      </div>
    </div>
  );
}
