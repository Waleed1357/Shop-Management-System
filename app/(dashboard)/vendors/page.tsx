import type { Metadata } from "next";
import VendorPaymentsList from "@/components/vendors/VendorPaymentsList";

export const metadata: Metadata = { title: "Vendor Payments | Awan Electronics" };

export default function VendorsPage() {
  return <VendorPaymentsList />;
}
