import type { Metadata } from "next";
import InventoryManagement from "@/components/inventory/InventoryManagement";

export const metadata: Metadata = { title: "Inventory | Awan Electronics" };

export default function InventoryPage() {
  return <InventoryManagement />;
}
