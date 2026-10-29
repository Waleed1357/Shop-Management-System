import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

/**
 * Summary card: title, coloured icon and a big number (shimmer while loading).
 * Pass `href` to make the whole card a link to another page.
 */
export default function MetricCard({
  icon,
  tone,
  label,
  value,
  loading,
  href,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  loading: boolean;
  href?: string;
}) {
  const card = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5",
        href && "group-hover/link:border-slate-300",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", tone)}>
          {icon}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        {loading ? (
          <div className="shimmer mt-4 h-8 w-32 rounded-lg" />
        ) : (
          <p className="mt-3 truncate text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{value}</p>
        )}
        {href && (
          <ArrowRight
            aria-hidden="true"
            className="mb-1.5 size-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-red-600"
          />
        )}
      </div>
      <div aria-hidden="true" className="absolute inset-x-5 bottom-0 h-px bg-linear-to-r from-transparent via-slate-100 to-transparent" />
    </Card>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      aria-label={`${label}: ${loading ? "loading" : value}. Open page`}
      className="group/link block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20"
    >
      {card}
    </Link>
  );
}
