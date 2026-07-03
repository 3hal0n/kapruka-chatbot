"use client";

/**
 * AuthPanel.tsx — Clerk session surface for Ruki.
 *
 * Reports the resolved identity (clerk user id + a session-token getter) up to
 * the page so every backend fetch can attach `Authorization: Bearer <token>`.
 * Renders as the sidebar's session/user-management control ("inline" variant,
 * embedded in the left rail next to chat history) — sign-in and account
 * management live where the rest of the workspace controls do, not floating
 * over the canvas.
 *
 * Signed-in state uses a CUSTOM dropdown (not Clerk's default <UserButton/>
 * popover) so it can be width- and edge-aligned to the sidebar and host the
 * dark-mode toggle alongside "Manage account" / "Sign out".
 *
 * IMPORTANT: only mount this component when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * is configured — Clerk hooks require a <ClerkProvider> ancestor. The page
 * gates on `clerkEnabled` so guest-only deployments never touch these hooks.
 */

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { ChevronDown, LogIn, LogOut, Moon, Settings, Sun } from "lucide-react";

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
  /** True when the sidebar rail is collapsed to icon-only width. */
  collapsed?: boolean;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
}

export function AuthPanel({ onIdentity, collapsed = false, theme = "light", onToggleTheme }: AuthPanelProps) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const label = user?.firstName || user?.username || "Member";
  const email = user?.primaryEmailAddress?.emailAddress || "";

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

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const menuRow =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-foreground/90 transition-colors hover:bg-primary-soft cursor-pointer";

  return (
    <div className="relative" ref={rootRef}>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            aria-label="Sign in to Ruki"
            className={
              collapsed
                ? "mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer"
                : "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-xs font-bold text-foreground/90 transition-all duration-300 hover:bg-primary-soft cursor-pointer"
            }
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-vivid">
              <LogIn className="h-4 w-4" aria-hidden="true" />
            </span>
            {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Sign in</span>}
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <button
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
          className={
            collapsed
              ? "mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-primary-soft cursor-pointer"
              : "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-primary-soft cursor-pointer"
          }
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-primary/40"
            />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber text-xs font-black text-amber-foreground">
              {label.slice(0, 1).toUpperCase()}
            </span>
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-xs font-bold text-foreground/90">{label}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform ${open ? "rotate-180" : ""}`} />
            </>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={
                collapsed
                  ? "absolute bottom-0 left-full z-50 ml-2 w-56 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl"
                  : "absolute bottom-full left-0 z-50 mb-2 w-full min-w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl"
              }
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-primary/40" />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber text-xs font-black text-amber-foreground">
                    {label.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-foreground">{user?.fullName || label}</p>
                  {email && <p className="truncate text-[10px] font-medium text-muted-foreground">{email}</p>}
                </div>
              </div>

              <div className="my-1 h-px bg-border" />

              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  openUserProfile();
                }}
                className={menuRow}
              >
                <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Manage account
              </button>

              {onToggleTheme && (
                <button role="menuitem" onClick={onToggleTheme} className={menuRow}>
                  {theme === "light" ? (
                    <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </button>
              )}

              <div className="my-1 h-px bg-border" />

              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className={`${menuRow} hover:bg-red-500/10 hover:text-red-500`}
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </SignedIn>
    </div>
  );
}
