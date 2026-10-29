"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import ShopPurchaseFormModal from "@/components/invoices/ShopPurchaseFormModal";

interface ShopPurchaseModalContextValue {
  openPurchase: () => void;
}

const ShopPurchaseModalContext = createContext<ShopPurchaseModalContextValue>({
  openPurchase: () => {},
});

export function ShopPurchaseModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPurchase = useCallback(() => setOpen(true), []);
  const closePurchase = useCallback(() => setOpen(false), []);
  const handleSaved = useCallback(() => {
    window.dispatchEvent(new Event("shop-purchase-saved"));
    closePurchase();
  }, [closePurchase]);

  return (
    <ShopPurchaseModalContext value={{ openPurchase }}>
      {children}
      <ShopPurchaseFormModal
        open={open}
        onClose={closePurchase}
        onSaved={handleSaved}
      />
    </ShopPurchaseModalContext>
  );
}

export const useShopPurchaseModal = () => useContext(ShopPurchaseModalContext).openPurchase;
