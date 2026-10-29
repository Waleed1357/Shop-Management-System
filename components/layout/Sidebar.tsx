
/* eslint-disable @next/next/no-img-element -- avatar comes from Supabase Storage at runtime */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HandCoins,
  Truck,
  Wallet,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  ShoppingBag,
  Settings,
  ClipboardList,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useSettings } from "@/components/providers/SettingsProvider";

export const NAV_ITEMS = [
  {
    href: ROUTES.dashboard,
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: ROUTES.clients,
    label: "Complaints",
    icon: ClipboardList,
  },
  {
    href: ROUTES.purchases,
    label: "All Purchases",
    icon: ShoppingBag,
  },
  {
    href: ROUTES.invoices,
    label: "Invoices",
    icon: Receipt,
  },
  {
    href: ROUTES.inventory,
    label: "Inventory",
    icon: Package,
  },
  {
    href: ROUTES.technicians,
    label: "Technician Credit",
    icon: HandCoins,
  },
  {
    href: ROUTES.expenses,
    label: "Expenses",
    icon: Wallet,
  },
  {
    href: ROUTES.vendors,
    label: "Vendor Payments",
    icon: Truck,
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const { settings } = useSettings();

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Close mobile sidebar with Escape
  // and prevent background scrolling.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  async function logout() {
    setLoggingOut(true);

    try {
      const { error } = await createClient().auth.signOut();

      if (error) {
        throw error;
      }

      setConfirmLogout(false);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-[3px] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40",
          "flex w-72 max-w-[85vw] flex-col",
          "overflow-y-auto overscroll-y-contain",
          "[scrollbar-width:thin] [scrollbar-color:#292929_transparent]",
          "bg-[#08090B] text-white",
          "border-r border-white/[0.07]",
          "shadow-[8px_0_40px_rgba(0,0,0,0.35)]",
          "transition-transform duration-300 ease-in-out",
          "pb-[env(safe-area-inset-bottom)]",
          "lg:w-72 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="relative px-5 pt-8 pb-7">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex h-16 items-center justify-center">
                <img
                  src={settings.logo_url || "/tv-logo.png"}
                  alt={`${settings.business_name} logo`}
                  className="h-full w-4/5 object-contain"
                />
              </div>
            </div>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center",
                "rounded-xl border border-white/10",
                "bg-white/[0.05] text-white/70",
                "transition-colors hover:bg-white/10",
                "hover:text-white lg:hidden"
              )}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className={cn(
            "flex-1 space-y-2",
            "px-3 pb-5"
          )}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              pathname.startsWith(`${href}/`);

            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-[52px]",
                  "items-center gap-4",
                  "rounded-2xl px-4 py-3",
                  "text-[14px] font-medium",
                  "transition-all duration-200",
                  "focus-visible:outline-none",
                  "focus-visible:ring-2",
                  "focus-visible:ring-red-500",
                  active
                    ? [
                        "bg-[#F0000B] text-white",
                        "font-semibold",
                        "shadow-[0_6px_22px_rgba(240,0,11,0.22)]",
                      ].join(" ")
                    : [
                        "text-[#D5D7DC]",
                        "hover:bg-white/[0.06]",
                        "hover:text-white",
                      ].join(" ")
                )}
              >
                {/* Navigation icon */}
                <span
                  className={cn(
                    "flex size-6 shrink-0",
                    "items-center justify-center",
                    "transition-transform duration-200",
                    !active && "group-hover:scale-110"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[21px]",
                      active
                        ? "text-white"
                        : "text-[#C9CDD5]"
                    )}
                    strokeWidth={active ? 2.3 : 1.9}
                  />
                </span>

                {/* Small vertical separator */}
                <span
                  className={cn(
                    "h-6 w-px shrink-0",
                    active
                      ? "bg-white/60"
                      : "bg-white/[0.12]"
                  )}
                />

                {/* Navigation text */}
                <span className="truncate">
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Settings and logout */}
        <div className="mt-auto px-3 pb-4">
          <div
            className={cn(
              "rounded-[22px]",
              "p-4"
            )}
          >
            <Link
              href={ROUTES.settings}
              onClick={onClose}
              aria-current={pathname === ROUTES.settings || pathname.startsWith(`${ROUTES.settings}/`) ? "page" : undefined}
              className={cn(
                "group flex w-full items-center gap-4 rounded-xl px-2 py-2.5",
                "text-left text-[14px] font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
                pathname === ROUTES.settings || pathname.startsWith(`${ROUTES.settings}/`)
                  ? "bg-[#F0000B] font-semibold text-white"
                  : "text-[#D5D7DC] hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <Settings className={cn("size-5 shrink-0", pathname === ROUTES.settings ? "text-white" : "text-[#C9CDD5]")} />
              <span className="h-5 w-px bg-white/[0.12]" />
              <span>Settings</span>
            </Link>
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className={cn(
                "group flex w-full items-center",
                "gap-4 rounded-xl",
                "px-2 py-2.5",
                "text-left text-[14px]",
                "font-medium text-[#E4E5E8]",
                "transition-all duration-200",
                "hover:bg-red-600/10",
                "hover:text-red-400",
                "focus-visible:outline-none",
                "focus-visible:ring-2",
                "focus-visible:ring-red-500"
              )}
            >
              <LogOut
                className={cn(
                  "size-5 shrink-0",
                  "transition-colors",
                  "group-hover:text-red-400"
                )}
                strokeWidth={1.9}
              />

              <span className="h-5 w-px bg-white/[0.12]" />

              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Logout confirmation */}
      <ConfirmModal
        open={confirmLogout}
        title="Confirm Logout"
        message="Are you sure you want to logout from your account?"
        confirmLabel="Logout"
        loading={loggingOut}
        onConfirm={logout}
        onCancel={() => setConfirmLogout(false)}
      />
    </>
  );
}
