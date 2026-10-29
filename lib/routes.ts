/**
 * Every page is reached through a fixed random ID, so the address bar shows
 * e.g. /e000d0e3-32c9-... instead of /dashboard.
 *
 * - next.config.ts serves each ID from its real page (rewrite) and forwards the
 *   old named addresses (/dashboard, /clients, ...) to the ID (redirect).
 * - Always link with ROUTES.x, never "/dashboard".
 * - Changing an ID breaks old bookmarks to the old ID, so leave them as they are.
 *
 * (No "@/..." imports here: next.config.ts loads this file too.)
 */
export const PAGE_IDS = {
  dashboard: "e000d0e3-32c9-4b49-87dd-f032b4d3e7b7",
  clients: "e9a4de4a-158d-4505-8838-bd87a3081550",
  invoices: "a33a8a71-ceef-4330-8e48-f351ee884229",
  purchases: "20214b71-8208-4095-9c52-dd93879989bf",
  inventory: "8ec99303-bfa7-4214-a4a3-9b531b522eff",
  technicians: "245eec13-6301-4fd7-abd5-4a9ca6daa539",
  expenses: "62899067-bd4f-47e7-ad04-6a533b961aae",
  vendors: "eccd8255-c3a1-4745-b3f2-14aec70d1f58",
  settings: "2e97c2b2-1eee-4738-984b-ff8b028ff1c5",
} as const;

export type PageName = keyof typeof PAGE_IDS;

/** Public address of each page, e.g. ROUTES.dashboard = "/e000d0e3-..." */
export const ROUTES = Object.fromEntries(
  Object.entries(PAGE_IDS).map(([name, id]) => [name, `/${id}`]),
) as Record<PageName, string>;
