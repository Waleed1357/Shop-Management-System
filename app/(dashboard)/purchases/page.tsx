import type { Metadata } from "next";
import ShopPurchasesList from "@/components/purchases/ShopPurchasesList";

export const metadata: Metadata = { title: "All Purchases | Awan Electronics" };

export default function PurchasesPage() {
  return <ShopPurchasesList />;
}
