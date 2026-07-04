"use client";

/**
 * InfoOverlays.tsx — judge-facing informational views for Ruki AI.
 *
 * Two premium full-screen overlays rendered over the live chat canvas:
 *  - FeaturesGuideView    → the problems Ruki solves + customer value props.
 *  - TechArchitectureView → system topology, multi-agent mesh, zero-trust
 *    credential pipeline, drawn with pure Tailwind cards + SVG connectors.
 *
 * Both are built on one shared shell (InfoOverlayShell) and styled entirely
 * with the design tokens (surface / border / foreground / primary / amber),
 * so they adapt automatically when the dark-mode toggle flips.
 */

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mic,
  ShoppingCart,
  Camera,
  Languages,
  ShieldCheck,
  Fingerprint,
  Lightbulb,
  Network,
  ArrowRight,
  ArrowDown,
  MonitorSmartphone,
  Server,
  Database,
  BrainCircuit,
  NotebookPen,
  Store,
  Truck,
  KeyRound,
  BadgeCheck,
  Cloud,
  Coins,
} from "lucide-react";

// ── Shared full-screen shell ──────────────────────────────────────────────────

interface InfoOverlayShellProps {
  open: boolean;
  onClose: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function InfoOverlayShell({ open, onClose, icon: Icon, title, subtitle, children }: InfoOverlayShellProps) {
  // Escape key closes, and the page behind must not scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-100 flex flex-col bg-background text-foreground"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/90 px-5 py-4 backdrop-blur-md md:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-primary-vivid to-primary-vivid-soft text-primary-foreground shadow-md">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black tracking-tight">{title}</h1>
                <p className="truncate text-[11px] font-semibold text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close and return to chat"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.05 }}
            className="scroll-slim flex-1 overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-10 md:py-12">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Small section header used by both views.
function SectionHeader({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary-vivid">{eyebrow}</p>
      <h2 className="text-xl font-black tracking-tight md:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">{blurb}</p>
    </div>
  );
}

// ── 💡 Features & Guide ───────────────────────────────────────────────────────

const FEATURES: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  problem: string;
  detail: string;
  example: string;
}[] = [
  {
    icon: Mic,
    title: "Hands-Free Voice Mode",
    problem: "Shopping shouldn't require a keyboard — or perfect eyesight.",
    detail:
      "Engineered for shoppers with low vision, motor disabilities, or literacy challenges. An ambient overlay keeps the chat visible while an automated microphone loop listens, submits, reads the reply aloud in a warm female voice, and re-opens the mic the instant Ruki finishes speaking.",
    example: "Tap the mic and just say “mata cake ekak oni”",
  },
  {
    icon: ShoppingCart,
    title: "AI-Automated Cart Operations",
    problem: "Zero manual friction between wanting and buying.",
    detail:
      "The multi-agent ecosystem resolves conversational references against what's on your screen — adding by partial name (“add the s11 mini”), by position (“add the first one”), removing single items, or clearing the whole cart, all from plain language in any of our three languages.",
    example: "“remove all items from my cart” → done",
  },
  {
    icon: Camera,
    title: "Multimodal Visual Search",
    problem: "Some products are easier to photograph than to describe.",
    detail:
      "Snap or upload a photo from the chat input. Gemini extracts semantic feature descriptors — category, material, colour, pattern, styling — and runs an instant match sweep against Kapruka's live inventory catalog.",
    example: "📷 photo of a leather bag → closest catalog matches",
  },
  {
    icon: Languages,
    title: "Trilingual Natural Engine",
    problem: "Sri Lanka shops in three overlapping languages.",
    detail:
      "Ruki parses and mirrors English, native Sinhala script (සිංහල), and conversational romanised Tanglish — detecting the language AND script of every message deterministically, replying in kind, and even speaking Sinhala aloud with a native si-LK voice.",
    example: "“hete birthday ekata gift ekak ona” → Tanglish reply",
  },
  {
    icon: ShieldCheck,
    title: "Dynamic Safeguard Framework",
    problem: "A thoughtful gift must never be an unsafe one.",
    detail:
      "A recipient milestone calendar logs occasions and dietary profiles, while a zero-trust, multi-layer allergen sweep (deterministic filters before AND after ranking, plus an LLM safety critic) purges flagged products before they ever reach the screen.",
    example: "“nuts allergy thiyenawa” → every nut product filtered",
  },
  {
    icon: Fingerprint,
    title: "Cloud Identity Access",
    problem: "Carts and preferences should follow the person, not the device.",
    detail:
      "Seamless OAuth and session abstraction through an integrated Clerk user-management surface. A verified clerk_id keys the persistent profile ledger and server-side cart, so context survives sign-outs, refreshes, and device switches.",
    example: "Sign in with Google → your cart is waiting",
  },
];

export function FeaturesGuideView({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <InfoOverlayShell
      open={open}
      onClose={onClose}
      icon={Lightbulb}
      title="Features & Guide"
      subtitle="What Ruki solves — and how to make it shine"
    >
      <SectionHeader
        eyebrow="Customer Value"
        title="Not a search box wearing a chat costume"
        blurb="Ruki reads the situation, has an opinion, and acts — six core capabilities engineered for the everyday Sri Lankan shopper."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, problem, detail, example }) => (
          <motion.article
            key={title}
            whileHover={{ y: -3 }}
            className="group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-primary-vivid/40"
          >
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary-vivid transition-colors group-hover:bg-linear-to-br group-hover:from-primary-vivid group-hover:to-primary-vivid-soft group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-sm font-black tracking-tight">{title}</h3>
            <p className="mt-0.5 text-[11px] font-bold text-primary-vivid/80">{problem}</p>
            <p className="mt-2 flex-1 text-xs font-medium leading-relaxed text-muted-foreground">{detail}</p>
            <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-[11px] font-bold text-foreground">
              <span className="mr-1 select-none">✦</span>
              {example}
            </p>
          </motion.article>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-border bg-primary-soft/50 p-5">
        <h3 className="text-sm font-black tracking-tight">Quick start for judges</h3>
        <ol className="mt-2 grid gap-1.5 text-xs font-medium text-muted-foreground sm:grid-cols-2">
          <li>1 · Ask in any language — try “mata birthday gift ekak oni, budget 5000”.</li>
          <li>2 · Say “add the first one to my cart”, then “remove it” — no clicks needed.</li>
          <li>3 · Tap the camera in the input bar and upload any product photo.</li>
          <li>4 · Tap the mic for the fully hands-free voice loop with spoken replies.</li>
        </ol>
      </div>
    </InfoOverlayShell>
  );
}

// ── 🏗️ Tech Architecture ──────────────────────────────────────────────────────

function NodeCard({
  icon: Icon,
  title,
  lines,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  lines: string[];
  accent?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={`flex-1 rounded-2xl border p-4 shadow-sm transition-colors ${
        accent
          ? "border-primary-vivid/50 bg-primary-soft/60 hover:border-primary-vivid"
          : "border-border bg-surface hover:border-primary-vivid/40"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-primary-vivid to-primary-vivid-soft text-primary-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-[13px] font-black tracking-tight">{title}</h3>
      </div>
      <ul className="space-y-1">
        {lines.map((l) => (
          <li key={l} className="flex gap-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
            {l}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center self-center" aria-hidden="true">
      <span className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-primary-vivid shadow-sm">
        <ArrowRight className="hidden h-4 w-4 md:block" />
        <ArrowDown className="h-4 w-4 md:hidden" />
      </span>
    </div>
  );
}

export function TechArchitectureView({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <InfoOverlayShell
      open={open}
      onClose={onClose}
      icon={Network}
      title="Tech Architecture"
      subtitle="Engineering topology of the Ruki multi-agent commerce platform"
    >
      {/* ── 1 · System topology ── */}
      <SectionHeader
        eyebrow="System Topology"
        title="Frontend → Gateway → Persistent Storage"
        blurb="A streaming-first pipeline: the browser talks SSE to a FastAPI gateway that guards every request with Clerk JWT verification before touching state."
      />
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <NodeCard
          icon={MonitorSmartphone}
          title="Next.js 16 Frontend"
          lines={[
            "React 19 chat canvas with SSE streaming reader",
            "Clerk OAuth session → Bearer token on every call",
            "Web Speech STT + Cloud TTS playback engine",
            "Photo upload → multimodal vision search",
          ]}
        />
        <FlowArrow />
        <NodeCard
          icon={Server}
          title="FastAPI Cloud Gateway"
          accent
          lines={[
            "Server-Sent Events chat stream (intent badges, carousels, cart ops)",
            "PyJWT + JWKS middleware verifies Clerk session tokens",
            "Orchestrates the multi-agent worker mesh below",
            "Kapruka MCP client (rate-limited, TTL-cached)",
          ]}
        />
        <FlowArrow />
        <NodeCard
          icon={Database}
          title="PostgreSQL Multi-Table Storage"
          lines={[
            "user_profiles — accumulated_context JSONB ledger keyed by clerk_id",
            "user_carts — cross-device cart items JSONB, FK → clerk_id",
            "gift_profiles — occasion calendar + allergen guardrails",
            "SQLite fallback keeps local dev zero-config",
          ]}
        />
      </div>

      {/* ── 2 · Multi-agent mesh ── */}
      <div className="mt-12">
        <SectionHeader
          eyebrow="Multi-Agent Worker Infrastructure"
          title="One orchestrator, three specialists"
          blurb="A central router classifies every turn (with deterministic interceptors for cart commands and language) and delegates to purpose-built sub-workers."
        />

        <div className="mx-auto max-w-md">
          <NodeCard
            icon={BrainCircuit}
            title="Central Orchestration Router"
            accent
            lines={[
              "Gemini 2.5 Flash intent classification (JSON-strict)",
              "Deterministic cart interceptors + carousel reference resolver",
              "Session continuity: budgets, allergens & locations carry forward",
            ]}
          />
        </div>

        {/* Branching connectors */}
        <svg
          viewBox="0 0 600 48"
          preserveAspectRatio="none"
          className="mx-auto -mb-1 mt-1 h-12 w-full max-w-3xl"
          aria-hidden="true"
        >
          <path d="M300 0 V14 M300 14 H100 M100 14 V48 M300 14 V48 M300 14 H500 M500 14 V48"
            className="fill-none stroke-primary-vivid/40" strokeWidth="2" />
          <circle cx="100" cy="48" r="4" className="fill-amber" />
          <circle cx="300" cy="48" r="4" className="fill-amber" />
          <circle cx="500" cy="48" r="4" className="fill-amber" />
        </svg>

        <div className="grid gap-4 md:grid-cols-3">
          <NodeCard
            icon={NotebookPen}
            title="Persistent Context Profile Agent"
            lines={[
              "Extracts long-term traits from every turn",
              "Relationships · lifestyle · shopping bias",
              "Upserts the accumulated_context JSONB ledger",
              "Fire-and-forget — never blocks the reply stream",
            ]}
          />
          <NodeCard
            icon={Store}
            title="General Store Shopper Agent"
            lines={[
              "Live Kapruka MCP catalog matching (mcp.kapruka.com)",
              "Category-fidelity + storefront-card filters",
              "Budget clamps & zero-trust allergen purges",
              "Warm trilingual concierge voice with opinions",
            ]}
          />
          <NodeCard
            icon={Truck}
            title="Fulfillment & Logistics Agent"
            lines={[
              "Regional destination parsing & city canonicalisation",
              "Live delivery-fee and feasibility checks via MCP",
              "Order tracking states & deadline advice",
              "Runs concurrently with search for one merged reply",
            ]}
          />
        </div>
      </div>

      {/* ── 3 · Zero-trust pipeline ── */}
      <div className="mt-12">
        <SectionHeader
          eyebrow="Zero-Trust Portfolio Pipeline"
          title="Enterprise credentials, no raw API keys"
          blurb="Model generation and speech synthesis authenticate through Vertex AI Application Default Credentials backed by a scoped IAM service account on the GCP project."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NodeCard
            icon={KeyRound}
            title="1 · IAM Service Account"
            lines={[
              "Scoped Vertex AI User role on the Kapruka GCP project",
              "JSON key mounted server-side, never shipped to the client",
            ]}
          />
          <NodeCard
            icon={BadgeCheck}
            title="2 · Application Default Credentials"
            lines={[
              "google-auth resolves & auto-refreshes OAuth2 tokens",
              "Token cache pre-warmed at gateway startup",
            ]}
          />
          <NodeCard
            icon={Cloud}
            title="3 · Vertex AI Model Pool"
            lines={[
              "Gemini 2.5 Flash — routing, concierge & vision tasks",
              "Cloud TTS — si-LK Sinhala + en-GB Neural2 female voices",
            ]}
          />
          <NodeCard
            icon={Coins}
            title="4 · Governed Billing"
            lines={[
              "All generation executes against the $300 GCP credit pool",
              "One revocable credential governs every model call",
            ]}
          />
        </div>

        <p className="mt-6 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-xs font-semibold text-foreground">
          Clerk-issued session JWTs are verified against the tenant JWKS at the FastAPI edge, Kapruka MCP calls are
          rate-limit aware with exponential backoff, and every allergen-sensitive recommendation passes a deterministic
          purge <em>plus</em> an LLM safety critic before rendering — trust is earned at each hop, never assumed.
        </p>
      </div>
    </InfoOverlayShell>
  );
}
