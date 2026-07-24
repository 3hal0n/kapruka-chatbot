/**
 * proxy.ts — Next.js 16 renamed the `middleware` file convention to `proxy`.
 * Clerk's session middleware runs here so `auth()` / `useAuth()` work app-wide.
 *
 * Clerk is OPTIONAL: when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set the
 * proxy is a pass-through and the app keeps its existing guest-only behaviour.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Server-only — never NEXT_PUBLIC_*. Shared with the backend's
// INTERNAL_API_KEY so its shared-secret middleware can reject any request
// that didn't come through this proxy (the backend may sit on a public
// Cloud Run URL with --allow-unauthenticated).
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Attaches the shared secret onto the outgoing request headers before the
// declarative /api/:path* rewrite in next.config.ts fires — Proxy runs
// before rewrites in the routing pipeline, and NextResponse.next({ request:
// { headers } }) is what makes a header visible to a rewrite destination.
function attachInternalHeader(request: NextRequest) {
  if (!INTERNAL_API_KEY || !request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const headers = new Headers(request.headers);
  headers.set("X-Internal-Api-Key", INTERNAL_API_KEY);
  return NextResponse.next({ request: { headers } });
}

// All routes stay public — Clerk only hydrates the session so the chat can
// attach a bearer token; sign-in is never forced on shoppers.
export default clerkEnabled
  ? clerkMiddleware((_auth, request) => attachInternalHeader(request))
  : attachInternalHeader;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
