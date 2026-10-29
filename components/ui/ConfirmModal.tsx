"use client";

import { useEffect } from "react";
import { CircleAlert, X } from "lucide-react";
import Button from "./Button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  loading,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-55 flex animate-fade-in items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative w-full max-w-sm animate-pop-in rounded-2xl bg-white p-6 text-center shadow-2xl">
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50">
          <div className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white">
            <CircleAlert className="size-6" />
          </div>
        </div>
        <h2 className="mt-5 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-sm text-slate-500">{message}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
