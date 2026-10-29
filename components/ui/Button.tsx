import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  size?: "sm" | "md";
}

export default function Button({
  variant = "primary",
  loading = false,
  size = "md",
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
