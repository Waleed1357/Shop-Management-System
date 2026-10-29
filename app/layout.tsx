import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import EnterKeyNavigation from "@/components/providers/EnterKeyNavigation";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Awan Electronics Service Center",
  description: "Complaint, invoice and inventory management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#64748b", // browser bar color on mobile (matches the sidebar)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla, Grammarly) add attributes to <body>.
          It only applies to this tag's own attributes, not to anything inside it. */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* Enter jumps to the next field in every form */}
        <EnterKeyNavigation />
        {children}
      </body>
    </html>
  );
}
