import { NextResponse } from "next/server";

import { auth } from "@/auth";

/**
 * Optimistic redirects based on the session cookie only (no database work).
 * Real authorization happens in the data access layer (requireAdmin) and in
 * API route guards (withAuth).
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAdmin = request.auth?.user?.role === "ADMIN";

  if (pathname.startsWith("/admin") && !isAdmin) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }
  if (pathname === "/login" && isAdmin) {
    return NextResponse.redirect(new URL("/admin", request.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
