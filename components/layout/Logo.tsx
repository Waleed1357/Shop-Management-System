/* eslint-disable @next/next/no-img-element -- logo comes from Supabase Storage at runtime */
import { cn } from "@/lib/utils";

interface LogoProps {
  logoUrl: string | null;
  businessName: string;
  light?: boolean;
  className?: string;
}

/** Shows the uploaded logo, or a default "AE" mark with the business name. */
export default function Logo({ logoUrl, businessName, light, className }: LogoProps) {
  const [first, ...rest] = businessName.split(" ");
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-md bg-white object-contain p-0.5" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-red-600 text-lg font-black tracking-tighter text-white">
          AE
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className={cn("truncate text-base font-extrabold uppercase", light ? "text-white" : "text-slate-800")}>{first}</p>
        <p className={cn("truncate text-[10px] font-semibold uppercase tracking-wider", light ? "text-white/80" : "text-red-600")}>
          {rest.join(" ")}
        </p>
      </div>
    </div>
  );
}
