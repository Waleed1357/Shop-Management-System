"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SettingsProvider } from "@/components/providers/SettingsProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ComplaintModalProvider } from "@/components/providers/ComplaintModalProvider";
import { ShopPurchaseModalProvider } from "@/components/providers/ShopPurchaseModalProvider";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <SettingsProvider>
      <ToastProvider>
        <ComplaintModalProvider>
          <ShopPurchaseModalProvider>
            <div className="min-h-screen-safe">
              <Sidebar open={menuOpen} onClose={closeMenu} />
              <div className="min-w-0 lg:pl-72">
                <Header onMenu={() => setMenuOpen(true)} />
                {/* key re-runs the fade-in on every page change */}
                <main key={pathname} className="mx-auto max-w-350 animate-slide-up p-4 sm:p-6 lg:p-8">
                  {children}
                </main>
              </div>
            </div>
          </ShopPurchaseModalProvider>
        </ComplaintModalProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
