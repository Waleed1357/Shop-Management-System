"use client";

import type { ReactNode } from "react";
import Modal from "./Modal";

export type DetailRow = {
  label: string;
  value: ReactNode;
  /** Take the full width (for long text like address or notes). */
  wide?: boolean;
};

/** Read-only window that lists a record's details as "label / value" pairs. */
export default function DetailsModal({
  open,
  onClose,
  title,
  subtitle,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  rows: DetailRow[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} size="lg">
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className={row.wide ? "rounded-xl bg-slate-50 p-3 sm:col-span-2" : "rounded-xl bg-slate-50 p-3"}
          >
            <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-900">
              {row.value === null || row.value === undefined || row.value === "" ? "-" : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
