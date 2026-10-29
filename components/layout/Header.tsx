/* eslint-disable @next/next/no-img-element -- avatar comes from Supabase Storage at runtime */
"use client";

import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import { usePathname } from "next/navigation";
import { Menu, Plus, UserRound } from "lucide-react";
import Button from "@/components/ui/Button";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useComplaintModal } from "@/components/providers/ComplaintModalProvider";
import { useShopPurchaseModal } from "@/components/providers/ShopPurchaseModalProvider";
import { NAV_ITEMS } from "./Sidebar";

export default function Header({ onMenu }: { onMenu: () => void }) {
  const { settings } = useSettings();
  const openComplaint = useComplaintModal();
  const openPurchase = useShopPurchaseModal();
  const pathname = usePathname();

  const page = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{page?.label ?? ""}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Button onClick={() => openComplaint()} className="px-3 sm:px-4">
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Complaint</span>
        </Button>
        <Button variant="secondary" onClick={openPurchase} className="px-3 sm:px-4">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add Purchase</span>
        </Button>
        <Link
          href={ROUTES.settings}
          className="flex min-w-0 items-center gap-2 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-red-200"
          title="Settings"
        >
          {settings.avatar_url ? (
            <img src={settings.avatar_url} alt={`${settings.admin_name || "Admin"} profile`} className="size-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <UserRound className="size-5" />
            </div>
          )}
          <span className="hidden min-w-0 sm:block">
            <span className="block max-w-32 truncate text-sm font-medium leading-tight text-slate-700">
              {settings.admin_name || "Admin"}
            </span>
            <span className="mt-0.5 block text-xs leading-tight text-slate-500">Admin</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
