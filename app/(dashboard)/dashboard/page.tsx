import type { Metadata } from "next";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata: Metadata = { title: "Dashboard | Awan Electronics" };

export default function DashboardPage() {
  return <Dashboard />;
}
