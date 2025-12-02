"use client";

import { useToast } from "@/context/ToastContext";

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-slide-in px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-[var(--success)] text-white"
              : "bg-[var(--error)] text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

