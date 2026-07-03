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

const passthrough = (_request: NextRequest) => NextResponse.next();

// All routes stay public — Clerk only hydrates the session so the chat can
// attach a bearer token; sign-in is never forced on shoppers.
export default clerkEnabled ? clerkMiddleware() : passthrough;

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
