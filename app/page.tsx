import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

// The proxy already sends visitors to /login or the dashboard; this is a fallback.
export default function Home() {
  redirect(ROUTES.dashboard);
}
