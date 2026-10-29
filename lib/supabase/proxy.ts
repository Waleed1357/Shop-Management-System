import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES } from "../routes";

const PUBLIC_ROUTES = ["/login"];

/**
 * Refreshes the Supabase session cookie on every request and
 * redirects between /login and the dashboard depending on auth state.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // getClaims() verifies the JWT; don't run other code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // API routes check the session themselves and answer with JSON (401), not a redirect to /login.
  if (pathname.startsWith("/api/")) return response;

  if (!isLoggedIn && !isPublic) {
    return redirectWithCookies(request, response, "/login");
  }
  if (isLoggedIn && (isPublic || pathname === "/")) {
    return redirectWithCookies(request, response, ROUTES.dashboard);
  }

  return response;
}

function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
