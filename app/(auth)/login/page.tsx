import type { Metadata } from "next";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Login | Awan Electronics" };

export default function LoginPage() {
  return <LoginForm />;
}
