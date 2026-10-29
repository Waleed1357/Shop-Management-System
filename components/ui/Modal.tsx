"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "wide" | "xl" | "full";
  /** Use (nearly) the full screen height, for long tables. */
  tall?: boolean;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", wide: "max-w-5xl", xl: "max-w-6xl", full: "max-w-[min(96vw,1440px)]" };

export default function Modal({ open, onClose, title, subtitle, children, size = "md", tall }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "flex max-h-modal w-full animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl",
          sizes[size],
          tall && "h-[92dvh]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-red-700 bg-red-600 px-4 py-4 text-white sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && <p className="text-sm text-red-50">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 rounded-lg p-2 text-white/90 transition-colors hover:bg-red-700 hover:text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 pb-safe sm:p-6">{children}</div>
      </div>
    </div>
  );
}
