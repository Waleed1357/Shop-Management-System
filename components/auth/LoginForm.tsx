
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { Eye, EyeOff, Lock, Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    // The current year is client-only to avoid reading the clock during prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentYear(new Date().getFullYear());
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const { error: authError } = await createClient()
        .auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Incorrect email or password."
            : authError.message
        );
        setLoading(false);
        return;
      }

      router.replace(ROUTES.dashboard);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F3F5F9] px-4 py-4 sm:px-6 sm:py-6 lg:px-10">
      {/* MAIN LOGIN CARD */}
      <div className="grid w-full max-w-[1150px] overflow-hidden rounded-[24px] bg-white shadow-[0_20px_80px_rgba(15,23,42,0.09)] lg:h-[min(650px,calc(100dvh-3rem))] lg:grid-cols-2">
        
        {/* LEFT - BRANDING */}
        <section className="relative hidden items-center justify-center overflow-hidden bg-[#F8F9FC] lg:flex">
          <div className="pointer-events-none absolute -left-32 -top-32 h-[350px] w-[350px] rounded-full bg-slate-200/50 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-32 -right-32 h-[350px] w-[350px] rounded-full bg-slate-200/50 blur-3xl" />

          <div className="relative z-10 flex w-full flex-col items-center justify-center px-12">
            <Image
              src="/awan-logo.png"
              alt="Awan Electronics"
              width={480}
              height={320}
              priority
              className="h-auto w-full max-w-[440px] object-contain"
            />
          </div>

          <p className="absolute bottom-7 text-center text-xs text-slate-400">
            © {currentYear ?? ""} Awan Electronics.
            All rights reserved.
          </p>
        </section>

        {/* RIGHT - LOGIN FORM */}
        <section className="flex items-center justify-center px-6 py-7 sm:px-12 sm:py-10 lg:px-14 lg:py-8 xl:px-16">
          <div className="w-full max-w-[400px]">
            
            {/* MOBILE LOGO */}
            <div className="mb-6 flex justify-center sm:mb-8 lg:hidden">
              <Image
                src="/awan-logo.png"
                alt="Awan Electronics"
                width={480}
                height={240}
                priority
                className="h-auto w-[220px] object-contain sm:w-[260px]"
              />
            </div>

            {/* HEADING */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-[28px] font-bold tracking-tight text-[#0B1B35] sm:text-[36px]">
                Welcome Back
              </h1>

              <p className="mt-3 text-sm text-slate-500">
                Sign in to your account
              </p>
            </div>

            {/* FORM */}
            <form onSubmit={onSubmit} className="space-y-5">
              
              {/* EMAIL */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-[#18263E]"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="h-[54px] w-full rounded-xl border border-[#E2E7EF] bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-[#18263E]"
                >
                  Password
                </label>

                <div className="relative">
                  <Lock
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="h-[54px] w-full rounded-xl border border-[#E2E7EF] bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  >
                    {showPassword ? (
                      <EyeOff size={19} />
                    ) : (
                      <Eye size={19} />
                    )}
                  </button>
                </div>
              </div>

              {/* ERROR */}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {error}
                </div>
              )}

              {/* SIGN IN BUTTON */}
              <button
                type="submit"
                disabled={loading}
                className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-[#ED0712] text-base font-semibold text-white shadow-[0_8px_22px_rgba(237,7,18,0.14)] transition-all duration-200 hover:bg-[#CF0610] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                {loading ? (
                  <>
                    <Loader2 size={19} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            {/* MOBILE FOOTER */}
            <p className="mt-6 text-center text-xs text-slate-400 sm:mt-8 lg:hidden">
              © {currentYear ?? ""} Awan Electronics
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
