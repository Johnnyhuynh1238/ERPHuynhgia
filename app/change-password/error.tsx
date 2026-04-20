"use client";

import { useEffect } from "react";

export default function ChangePasswordError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CHANGE_PASSWORD_ERROR]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-red-700">Có lỗi khi tải màn đổi mật khẩu</h2>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[#1F4E79] px-4 py-2 text-sm font-medium text-white hover:bg-[#163a5b]"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
