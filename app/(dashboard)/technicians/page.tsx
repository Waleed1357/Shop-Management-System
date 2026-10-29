import type { Metadata } from "next";
import TechnicianCredits from "@/components/technicians/TechnicianCredits";

export const metadata: Metadata = { title: "Technicians | Awan Electronics" };

export default function TechniciansPage() {
  return <TechnicianCredits />;
}
