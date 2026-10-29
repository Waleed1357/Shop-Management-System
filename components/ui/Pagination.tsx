"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Show at most 5 page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);

  const btn = "flex size-8 items-center justify-center rounded-md text-sm transition-colors disabled:opacity-40";
  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button className={cn(btn, "hover:bg-slate-100")} disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(btn, p === page ? "bg-red-600 text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {p}
        </button>
      ))}
      <button className={cn(btn, "hover:bg-slate-100")} disabled={page === totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export const PAGE_SIZE = 10;

export function paginate<T>(rows: T[], page: number) {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
