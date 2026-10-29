"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";

type ToastType = "success" | "error";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-60 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-lg"
          >
            {t.type === "success" ? (
              <CircleCheck className="size-5 shrink-0 text-green-600" />
            ) : (
              <CircleX className="size-5 shrink-0 text-red-600" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export const useToast = () => useContext(ToastContext);
