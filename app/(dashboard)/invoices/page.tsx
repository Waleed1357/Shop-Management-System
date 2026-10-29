import type { Metadata } from "next";
import InvoicesList from "@/components/invoices/InvoicesList";

export const metadata: Metadata = { title: "Invoices | Awan Electronics" };

export default function InvoicesPage() {
  return <InvoicesList />;
}
