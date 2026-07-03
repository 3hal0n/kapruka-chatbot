"use client";

/**
 * AuthPanel.tsx — Clerk session surface for Ruki.
 *
 * Renders the floating sign-in chip / user button AND reports the resolved
 * identity (clerk user id + a session-token getter) up to the page so every
 * backend fetch can attach `Authorization: Bearer <token>`.
 *
 * IMPORTANT: only mount this component when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * is configured — Clerk hooks require a <ClerkProvider> ancestor. The page
 * gates on `clerkEnabled` so guest-only deployments never touch these hooks.
 */

import React, { useEffect } from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { LogIn } from "lucide-react";

export interface RukiIdentity {
  /** Clerk user id ("user_2N...") when signed in, otherwise null (guest). */
  userId: string | null;
  /** Display label for the sidebar chip (first name / username). */
  label: string | null;
  /** Fresh short-lived session JWT for backend calls; null when guest. */
  getToken: () => Promise<string | null>;
}

interface AuthPanelProps {
  onIdentity: (identity: RukiIdentity) => void;
}

export function AuthPanel({ onIdentity }: AuthPanelProps) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();

  const label = user?.firstName || user?.username || "Member";

  useEffect(() => {
    if (!isLoaded) return;
    onIdentity({
      userId: isSignedIn && userId ? userId : null,
      label: isSignedIn ? label : null,
      getToken: async () => {
        if (!isSignedIn) return null;
        try {
          return await getToken();
        } catch {
          return null;
        }
      },
    });
    // onIdentity is intentionally omitted — parent passes a stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId, label]);

  return (
    // top-18 (not top-4): the chat surface already pins its cart pill to
    // top-4/right-4 (see animated-ai-chat.tsx) — stacking below it avoids
    // guessing at the cart pill's width, which changes with the item count
    // and the "Cart" label being hidden below the sm breakpoint.
    <div className="fixed right-4 top-18 z-90 flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            aria-label="Sign in to Ruki"
            className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2 text-sm font-bold text-foreground shadow-lg backdrop-blur transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: { avatarBox: "h-10 w-10 ring-2 ring-primary/40" },
          }}
        />
      </SignedIn>
    </div>
  );
}
