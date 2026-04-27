"use client";

import { useEffect } from "react";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PROFILE_ERROR]", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-white p-6">
      <h2 className="mb-2 text-lg font-semibold text-red-700">Có lỗi khi tải hồ sơ</h2>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-600"
      >
        Thử lại
      </button>
    </div>
  );
}
