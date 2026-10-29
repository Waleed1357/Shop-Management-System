import type { Metadata } from "next";
import ClientsList from "@/components/clients/ClientsList";

export const metadata: Metadata = { title: "Complaints | Awan Electronics" };

export default function ClientsPage() {
  return <ClientsList />;
}
