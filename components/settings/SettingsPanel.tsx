/* eslint-disable @next/next/no-img-element -- images come from Supabase Storage at runtime */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Upload, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, errorMessage } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import Logo from "@/components/layout/Logo";
import { useSettings } from "@/components/providers/SettingsProvider";
import { useToast } from "@/components/providers/ToastProvider";

export default function SettingsPanel() {
  const [tab, setTab] = useState<"profile" | "password">("profile");
  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and business information" />
      <Card>
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          {(["profile", "password"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors",
                tab === t ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {t === "profile" ? "Profile" : "Change Password"}
            </button>
          ))}
        </div>
        {tab === "profile" ? <ProfileTab /> : <PasswordTab />}
      </Card>
    </>
  );
}

async function uploadImage(file: File, prefix: string) {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}

function ProfileTab() {
  const toast = useToast();
  const { settings, email, refresh } = useSettings();
  const [businessName, setBusinessName] = useState(settings.business_name);
  const [adminName, setAdminName] = useState(settings.admin_name);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url);
  const [avatarUrl, setAvatarUrl] = useState(settings.avatar_url);
  const [uploading, setUploading] = useState<"logo" | "avatar" | null>(null);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  // Settings load asynchronously; sync the form once they arrive.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mirror loaded settings into the form */
    setBusinessName(settings.business_name);
    setAdminName(settings.admin_name);
    setLogoUrl(settings.logo_url);
    setAvatarUrl(settings.avatar_url);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [settings]);

  async function onFile(kind: "logo" | "avatar", file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Please choose an image file", "error");
    if (file.size > 2 * 1024 * 1024) return toast("Image must be under 2 MB", "error");
    setUploading(kind);
    try {
      const url = await uploadImage(file, kind);
      if (kind === "logo") setLogoUrl(url);
      else setAvatarUrl(url);
      toast("Image uploaded. Click Save Changes to apply.");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setUploading(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createClient()
      .from("settings")
      .upsert({ id: 1, business_name: businessName.trim(), admin_name: adminName.trim(), logo_url: logoUrl, avatar_url: avatarUrl, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast(errorMessage(error), "error");
    await refresh();
    toast("Settings saved");
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-5">
        <h3 className="text-sm font-semibold text-slate-800">Business Information</h3>
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-dashed border-slate-300 p-5">
          <Logo logoUrl={logoUrl} businessName={businessName || "Business"} />
          <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => onFile("logo", e.target.files?.[0])} />
          <Button type="button" variant="secondary" className="border-red-300 text-red-600" loading={uploading === "logo"} onClick={() => logoInput.current?.click()}>
            <Upload className="size-4" /> Upload Logo
          </Button>
        </div>
        <Field label="Business Name" required>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        </Field>
      </section>

      <section className="space-y-5">
        <h3 className="text-sm font-semibold text-slate-800">Profile</h3>
        <div className="flex flex-wrap items-center gap-5 rounded-lg border border-dashed border-slate-300 p-5">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile" className="size-20 rounded-full object-cover" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <UserRound className="size-10" />
            </div>
          )}
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => onFile("avatar", e.target.files?.[0])} />
          <Button type="button" variant="secondary" className="border-red-300 text-red-600" loading={uploading === "avatar"} onClick={() => avatarInput.current?.click()}>
            <Upload className="size-4" /> Upload Picture
          </Button>
        </div>
        <Field label="Your Name" required>
          <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input value={email} disabled />
        </Field>
      </section>

      <div className="flex justify-end lg:col-span-2">
        <Button type="submit" loading={saving}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

function PasswordTab() {
  const toast = useToast();
  const { email } = useSettings();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) return toast("New password must be at least 6 characters", "error");
    if (next !== confirm) return toast("New passwords do not match", "error");
    setSaving(true);
    const supabase = createClient();
    // Check the current password before changing it.
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authError) {
      setSaving(false);
      return toast("Current password is incorrect", "error");
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) return toast(errorMessage(error), "error");
    setCurrent("");
    setNext("");
    setConfirm("");
    toast("Password changed");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <Field label="Current Password" required>
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New Password" required>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label="Confirm New Password" required>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button type="submit" loading={saving}>
        Update Password
      </Button>
    </form>
  );
}
