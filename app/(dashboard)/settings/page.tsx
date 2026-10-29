import type { Metadata } from "next";
import SettingsPanel from "@/components/settings/SettingsPanel";

export const metadata: Metadata = { title: "Settings | Awan Electronics" };

export default function SettingsPage() {
  return <SettingsPanel />;
}
