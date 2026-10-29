import { Noto_Nastaliq_Urdu } from "next/font/google";

/**
 * Urdu (Nastaliq) font for the warranty terms printed on receipts.
 * Served from our own site by Next.js. preload: false = only downloaded when a receipt is made.
 */
export const urduFont = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});
