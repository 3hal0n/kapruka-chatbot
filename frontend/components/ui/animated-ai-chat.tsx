"use client";

import * as React from "react";
import {
  ArrowUp,
  Camera,
  Mic,
  X,
  Menu,
  History,
  Trash2,
  Sun,
  Moon,
  ShoppingCart,
  AlertCircle,
  Plus,
  Gift,
  Flower,
  Percent,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Lightbulb,
  Network,
} from "lucide-react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { ProductCard, Product } from "@/components/ProductCard";
import { KaprukaSmileGlow } from "@/components/ui/kapruka-smile-glow";
import { RukiLogo } from "@/components/ui/logo";
import { RukiThinkingMark } from "@/components/ui/ruki-thinking";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  products?: Product[];
  latency?: number;
  isError?: boolean;
  intents?: string[];
}

interface AnimatedAIChatProps {
  messages?: Message[];
  onSendMessage?: (content: string) => void;
  /** Opens the hands-free voice assistant overlay (mic button in the input bar). */
  onOpenVoiceMode?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatHistory?: { id: string; title: string; date: string }[];
  onSelectHistoryItem?: (id: string) => void;
  onDeleteHistoryItem?: (id: string) => void;
  activeChatId?: string;
  onStartNewChat?: () => void;
  introComponent?: React.ReactNode;

  // Theme & tools (hosted in the sidebar, not a top navbar)
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onOpenFeatures?: () => void;
  onOpenArchitecture?: () => void;
  onClearHistory?: () => void;
  onToggleCart?: () => void;
  cartCount?: number;
  guestId?: string;

  // Gifting flow props
  onAddToCart?: (product: Product) => void;
  onAddToBox?: (product: Product, rect: DOMRect) => void;
  activeMode?: string;

  // Multimodal + quick-start controls in the input bar
  onAttachImage?: () => void;
  suggestions?: string[];

  /** Renders in place of the static guest card in the sidebar's session slot
   *  (e.g. Clerk sign-in / user-management). Receives whether the rail is
   *  currently collapsed to icon-only width. Falls back to the plain guest
   *  card when omitted (guest-only deployments). */
  authSlot?: (collapsed: boolean) => React.ReactNode;
}

const DEFAULT_SUGGESTIONS = [
  "What's trending for someone who loves tech?",
  "I need groceries for the week",
  "Find a birthday gift under Rs. 3000",
  "Track my last order",
];

// Rotating input-placeholder examples — quietly teaches what Ruki can do.
// Kept short and action-oriented so the same array fits on every screen size
// (the CSS safety net below also forces single-line clipping as a backstop).
const PLACEHOLDER_EXAMPLES = [
  "Find a birthday cake...",
  "Compare Samsung phones...",
  "Suggest a gift hamper...",
  "Track my order...",
];

/** Typewriter placeholder: types each example, pauses, wipes, moves on.
 *  Static text when the input has content or the user prefers reduced motion. */
function useTypingPlaceholder(active: boolean): string {
  const [text, setText] = React.useState("What's on your mind?");

  React.useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets a possibly-stale mid-typing phrase when the user's motion preference is detected, not a render-derived value
      setText("What's on your mind?");
      return;
    }

    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const examples = PLACEHOLDER_EXAMPLES;
      const phrase = examples[phraseIdx % examples.length];
      if (!deleting) {
        charIdx += 1;
        setText(phrase.slice(0, charIdx));
        if (charIdx >= phrase.length) {
          deleting = true;
          timer = setTimeout(tick, 2400); // linger so it can be read
          return;
        }
        timer = setTimeout(tick, 42);
      } else {
        charIdx = Math.max(0, charIdx - 2);
        setText(phrase.slice(0, charIdx) || " ");
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % examples.length;
          timer = setTimeout(tick, 420);
          return;
        }
        timer = setTimeout(tick, 16);
      }
    };

    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [active]);

  return active ? text : "What's on your mind?";
}

// Ruki quick-start suggestions — mirrors the Kapruka gifting shortcuts
const SUGGESTION_PILLS: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Build a surprise box", icon: Gift },
  { label: "Find a birthday pick", icon: Flower },
  { label: "Compare top deals", icon: Percent },
];

function EmptyStateIllustration({ theme }: { theme: "light" | "dark" }) {
  return (
    <svg className="h-20 w-20 mx-auto opacity-75 mb-3" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" className="text-primary/40 animate-[spin_60s_linear_infinite]" />
      <rect x="35" y="45" width="30" height="25" rx="3" stroke="currentColor" strokeWidth="2" className="text-primary/60" />
      <path d="M35 52H65" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
      <path d="M50 45V70" stroke="currentColor" strokeWidth="1.5" className="text-primary/60" />
      <path d="M42 45C42 38 48 38 50 45C52 38 58 38 58 45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber" />
      <circle cx="68" cy="38" r="12" fill={theme === "dark" ? "#1E0B36" : "#ffffff"} stroke="currentColor" strokeWidth="2" className="text-amber" />
      <line x1="76.5" y1="46.5" x2="88" y2="58" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-amber" />
      <path d="M22 28L25 25M25 25L28 28M25 25V31M19 25H31" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-primary/30" />
      <circle cx="80" cy="20" r="2" fill="currentColor" className="text-amber/50" />
    </svg>
  );
}

// Playful, rotating "thinking" verbs — cycles like a coding assistant while the
// backend works, replacing the old robotic "Analyzing context..." status text.
const THINKING_PHRASES = [
  "thinking",
  "cooking",
  "concocting",
  "brewing ideas",
  "hunting for gifts",
  "wrapping thoughts",
  "consulting the catalog",
  "sprinkling magic",
  "pondering",
  "curating picks",
];

function ThinkingIndicator({ status }: { status?: string | null }) {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    // Slow, calm rotation — rapid phrase swapping reads as jittery noise.
    const t = setInterval(() => setIdx((p) => (p + 1) % THINKING_PHRASES.length), 5000);
    return () => clearInterval(t);
  }, []);

  // A specific backend status (e.g. delivery / profile refinement) takes over;
  // otherwise Ruki playfully cycles through the phrase list.
  const label = status && status.trim() ? status : `Ruki is ${THINKING_PHRASES[idx]}`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-primary-soft/60 px-4 py-3 text-sm text-foreground">
      <RukiThinkingMark className="h-7 w-7" />
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="font-semibold text-muted-foreground"
        >
          {label}
          <span className="ml-0.5 opacity-60">…</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// ── Lightweight markdown-table rendering for assistant replies ───────────────
// The comparison agent streams pipe-tables; everything else stays plain text.
// A 40-line parser beats shipping a full markdown library for one construct.

type ContentSegment = { type: "text"; text: string } | { type: "table"; rows: string[][] };

function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let textBuf: string[] = [];
  let tableRows: string[][] = [];

  const flushText = () => {
    const text = textBuf.join("\n");
    if (text.trim()) segments.push({ type: "text", text });
    textBuf = [];
  };
  const flushTable = () => {
    if (tableRows.length >= 2) segments.push({ type: "table", rows: tableRows });
    else if (tableRows.length) textBuf.push(tableRows.map((r) => r.join(" | ")).join("\n"));
    tableRows = [];
  };

  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|") && t.length > 2) {
      const cells = t.slice(1, -1).split("|").map((c) => c.replace(/\*\*/g, "").trim());
      const isSeparator = cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c));
      if (!isSeparator) {
        if (tableRows.length === 0) flushText();
        tableRows.push(cells);
      }
    } else {
      flushTable();
      textBuf.push(line);
    }
  }
  flushTable();
  flushText();
  return segments;
}

function AssistantContent({ content }: { content: string }) {
  const segments = React.useMemo(() => parseContentSegments(content), [content]);
  if (segments.length === 1 && segments[0].type === "text") {
    return <div className="whitespace-pre-wrap leading-relaxed">{content}</div>;
  }
  return (
    <div className="space-y-1">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <div key={i} className="whitespace-pre-wrap leading-relaxed">{seg.text}</div>
        ) : (
          <div key={i} className="my-1.5 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-max text-left text-xs">
              <thead>
                <tr className="bg-primary-soft">
                  {seg.rows[0].map((cell, ci) => (
                    <th key={ci} className="px-3 py-2 font-black tracking-tight text-foreground">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {seg.rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-t border-border">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-3 py-2 ${
                          ci === 0 ? "font-bold text-foreground" : "font-medium text-foreground/90"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

const isNoMatchesOrError = (msg: Message): boolean => {
  if (msg.role !== "assistant") return false;
  if (msg.isError) return true;

  const intents = msg.intents || [];
  if (intents.includes("CART_ACTION")) return false;
  if (intents.includes("LOGISTICS") && !intents.includes("SEARCH")) return false;

  if (intents.includes("SEARCH") && (!msg.products || msg.products.length === 0)) {
    return true;
  }

  const text = msg.content.toLowerCase();
  const noMatchesPhrases = [
    "couldn't find any products",
    "no products matching",
    "no matching products",
    "contained allergens you avoid",
    "could not find matching results",
  ];
  if (noMatchesPhrases.some((phrase) => text.includes(phrase)) && (!msg.products || msg.products.length === 0)) {
    return true;
  }

  return false;
};

export function AnimatedAIChat({
  messages = [],
  onSendMessage,
  onOpenVoiceMode,
  sidebarOpen = false,
  onToggleSidebar,
  chatHistory = [],
  onSelectHistoryItem,
  onDeleteHistoryItem,
  activeChatId,
  onStartNewChat,
  introComponent,
  theme = "light",
  onToggleTheme,
  onOpenFeatures,
  onOpenArchitecture,
  onClearHistory,
  onToggleCart,
  cartCount = 0,
  guestId,
  onAddToCart,
  onAddToBox,
  activeMode = "Smart Shopping",
  onAttachImage,
  suggestions = DEFAULT_SUGGESTIONS,
  authSlot,
}: AnimatedAIChatProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const chatFeedEndRef = React.useRef<HTMLDivElement>(null);
  const suggestionsRef = React.useRef<HTMLDivElement>(null);

  // Typewriter placeholder (pauses whenever the user has typed something).
  const typedPlaceholder = useTypingPlaceholder(inputValue === "");

  // Cart "pop" celebration — fires the moment the count INCREASES so the user
  // sees the AI actually did the work.
  const cartPopControls = useAnimation();
  const prevCartCountRef = React.useRef(cartCount);
  React.useEffect(() => {
    if (cartCount > prevCartCountRef.current) {
      cartPopControls.start({
        scale: [1, 1.18, 0.94, 1.06, 1],
        rotate: [0, -5, 4, -2, 0],
        transition: { duration: 0.55, ease: "easeOut" },
      });
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount, cartPopControls]);

  // One-time onboarding tip pointing at the hands-free mic.
  const [showVoiceTip, setShowVoiceTip] = React.useState(false);
  React.useEffect(() => {
    if (!isEmpty || !onOpenVoiceMode) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("ruki_voice_tip_seen")) return;
    const showTimer = setTimeout(() => setShowVoiceTip(true), 1400);
    const hideTimer = setTimeout(() => setShowVoiceTip(false), 12000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismissVoiceTip = React.useCallback(() => {
    setShowVoiceTip(false);
    try {
      localStorage.setItem("ruki_voice_tip_seen", "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  React.useEffect(() => {
    if (!showSuggestions) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  const isEmpty = messages.length === 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage?.(inputValue);
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  React.useEffect(() => {
    chatFeedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Pill-shaped input with micro-interactive focus glow ring ──────────────
  const inputBar = (
    <div className="relative" ref={suggestionsRef}>
      {/* Smart suggestions popover */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-30 mb-2 w-full min-w-64 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
              Try asking
            </div>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onSendMessage?.(s);
                  setShowSuggestions(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-foreground/90 transition-colors hover:bg-primary-soft cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-vivid" />
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time hands-free onboarding tip, anchored above the mic button */}
      <AnimatePresence>
        {showVoiceTip && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="absolute -top-16 right-2 z-30 sm:right-10"
          >
            <button
              onClick={() => {
                dismissVoiceTip();
                onOpenVoiceMode?.();
              }}
              className="flex items-center gap-2 rounded-2xl bg-linear-to-r from-primary-vivid to-primary-vivid-soft px-3.5 py-2.5 text-left text-[11px] font-bold text-primary-foreground shadow-[0_12px_32px_-10px_var(--primary-glow)] cursor-pointer"
            >
              <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Try Hands-Free Mode!
                <span className="block font-medium opacity-90">Click here and ask for a gift.</span>
              </span>
            </button>
            <button
              onClick={dismissVoiceTip}
              aria-label="Dismiss tip"
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
            {/* Pointer arrow aimed at the mic */}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 right-7 h-3 w-3 rotate-45 rounded-[2px] bg-primary-vivid-soft"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`relative flex items-end gap-2 rounded-[28px] border bg-surface/60 px-3 py-2 backdrop-blur-md transition-all duration-300 ${
          isFocused
            ? "border-primary-vivid/50 bg-surface shadow-[0_0_0_4px_var(--primary-glow),0_14px_44px_-14px_var(--primary-glow)]"
            : "border-border shadow-[0_14px_40px_-18px_rgba(60,27,99,0.28)]"
        }`}
      >
        <button
          onClick={() => onAttachImage?.()}
          disabled={!onAttachImage}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          title="Search by photo"
          aria-label="Search by photo — upload a product picture"
          type="button"
        >
          <Camera className="h-4 w-4" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={typedPlaceholder}
          aria-label="Message Ruki"
          className="max-h-32 min-h-[24px] flex-1 resize-none self-center overflow-y-auto bg-transparent py-1.5 text-xs tracking-tight leading-relaxed outline-none placeholder:text-muted-foreground/60 placeholder:whitespace-nowrap placeholder:overflow-hidden select-text sm:text-sm md:text-base md:tracking-normal"
        />

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowSuggestions((p) => !p)}
            title="Smart suggestions"
            aria-label="Smart suggestions"
            aria-expanded={showSuggestions}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
              showSuggestions
                ? "bg-primary-soft text-primary-vivid"
                : "text-muted-foreground hover:bg-primary-soft hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              dismissVoiceTip();
              onOpenVoiceMode?.();
            }}
            disabled={!onOpenVoiceMode}
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            title="Hands-free voice mode"
            aria-label="Open hands-free voice assistant"
          >
            <Mic className="h-4 w-4" />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            type="button"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all cursor-pointer ${
              inputValue.trim()
                ? "bg-linear-to-r from-primary-vivid to-primary-vivid-soft text-primary-foreground shadow-sm hover:brightness-105 active:scale-95"
                : "bg-muted text-muted-foreground/50 cursor-not-allowed"
            }`}
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const toolBtn =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-muted-foreground transition-all duration-300 hover:bg-primary-soft hover:text-foreground active:scale-[0.98] cursor-pointer";

  const initials = (guestId || "Guest").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "G";

  // ── Shared sidebar body — rendered both as the persistent desktop rail and
  // the slide-out mobile overlay, so the two never drift out of sync. ──────
  const sidebarBody = (collapsed: boolean, onCloseMobile?: () => void) => (
    <div className="flex h-full flex-col gap-1 overflow-hidden select-none">
      {/* Brand row */}
      <div className={`flex h-16 shrink-0 items-center gap-2 px-4 ${collapsed ? "justify-center px-2" : ""}`}>
        <RukiLogo className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
            <span className="text-base font-black tracking-tight text-foreground">Ruki</span>
            <span className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Kapruka
            </span>
          </span>
        )}
        {onCloseMobile ? (
          <button
            onClick={onCloseMobile}
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setRailCollapsed((p) => !p)}
            className="ml-auto hidden h-8 w-8 shrink-0 place-items-center rounded-xl text-muted-foreground/70 transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer md:grid"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className={`px-3 pt-1 ${collapsed ? "px-2" : ""}`}>
        {!collapsed && (
          <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
            Quick actions
          </div>
        )}
        <button
          onClick={() => {
            onStartNewChat?.();
            onCloseMobile?.();
          }}
          title="Start new chat"
          className={`group flex w-full items-center gap-2.5 rounded-xl bg-linear-to-r from-primary-vivid to-primary-vivid-soft text-primary-foreground shadow-[0_6px_18px_-8px_var(--primary-glow)] transition-all duration-300 hover:brightness-105 active:scale-[0.98] cursor-pointer ${
            collapsed ? "h-10 w-10 justify-center" : "px-3 py-2.5 text-xs font-black"
          }`}
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!collapsed && "Start new chat"}
        </button>
      </div>

      {/* Recent history */}
      <div className={`mt-3 flex-1 overflow-y-auto px-3 ${collapsed ? "px-2" : ""}`}>
        {!collapsed && (
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
            <History className="h-3 w-3" />
            Recent
          </div>
        )}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground/50">
              <History className="h-4 w-4" />
            </span>
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/50 text-center text-[11px] font-semibold text-muted-foreground/50">
            No chats yet
          </div>
        ) : (
          <div className="scroll-slim space-y-1">
            {chatHistory.map((chatItem) => {
              const isActive = activeChatId === chatItem.id;
              return (
                <div key={chatItem.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelectHistoryItem?.(chatItem.id);
                      onCloseMobile?.();
                    }}
                    className={`flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 pr-9 text-left transition-all duration-300 cursor-pointer ${
                      isActive
                        ? "border-border/40 bg-primary-soft"
                        : "border-transparent hover:border-border/30 hover:bg-primary-soft/60"
                    }`}
                  >
                    <span className="truncate text-xs font-bold text-foreground/90">{chatItem.title}</span>
                    <span className="text-[10px] text-muted-foreground/60">{chatItem.date}</span>
                  </button>
                  {onDeleteHistoryItem && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteHistoryItem(chatItem.id);
                      }}
                      aria-label={`Delete chat "${chatItem.title}"`}
                      title="Delete chat"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Utility tray */}
      <div className={`shrink-0 space-y-0.5 border-t border-border p-3 ${collapsed ? "px-2" : ""}`}>
        {onOpenFeatures && (
          <button
            onClick={() => {
              onOpenFeatures();
              onCloseMobile?.();
            }}
            title="Features & Guide"
            className={collapsed ? "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer mx-auto" : toolBtn}
          >
            <Lightbulb className="h-4 w-4" />
            {!collapsed && "Features & Guide"}
          </button>
        )}
        {onOpenArchitecture && (
          <button
            onClick={() => {
              onOpenArchitecture();
              onCloseMobile?.();
            }}
            title="Tech Architecture"
            className={collapsed ? "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer mx-auto" : toolBtn}
          >
            <Network className="h-4 w-4" />
            {!collapsed && "Tech Architecture"}
          </button>
        )}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title="Toggle theme"
            className={collapsed ? "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer mx-auto" : toolBtn}
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {!collapsed && (theme === "light" ? "Dark mode" : "Light mode")}
          </button>
        )}
        {onClearHistory && (
          <button
            onClick={onClearHistory}
            title="Clear chat"
            className={collapsed ? "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer mx-auto" : toolBtn}
          >
            <Trash2 className="h-4 w-4" />
            {!collapsed && "Clear chat"}
          </button>
        )}
      </div>

      {/* Guest / session card — swapped for real sign-in / user management
          when authSlot is provided (Clerk enabled); plain guest chip otherwise. */}
      <div className={`shrink-0 border-t border-border p-3 ${collapsed ? "px-2" : ""}`}>
        {authSlot ? (
          authSlot(collapsed)
        ) : (
        <div className={`flex items-center gap-2.5 rounded-xl px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber text-xs font-black text-amber-foreground">
            {initials}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground/90">{guestId || "Guest"}</p>
                <p className="text-[10px] text-muted-foreground/60">Guest</p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background text-foreground select-none">
      {/* Persistent desktop rail */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur-xl transition-all duration-300 md:flex ${
          railCollapsed ? "w-19" : "w-66"
        }`}
      >
        {sidebarBody(railCollapsed)}
      </aside>

      {/* Mobile slide-out overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <React.Fragment>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggleSidebar}
            />
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 flex w-70 flex-col border-r border-border bg-background/95 backdrop-blur-xl md:hidden"
            >
              {sidebarBody(false, onToggleSidebar)}
            </motion.aside>
          </React.Fragment>
        )}
      </AnimatePresence>

      {/* Full-canvas conversation surface */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Floating mobile sidebar toggle (upper-left).
            `fixed` (not absolute) + z-50: mobile browsers promote the message
            scroll container to its own compositing layer, which could paint
            over an absolutely-positioned sibling once the chat had content —
            fixed positioning keeps the control above the scroll layer. */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={onToggleSidebar}
              className="fixed left-4 top-4 z-50 grid h-11 w-11 place-items-center rounded-full border border-border bg-surface/90 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-primary-soft cursor-pointer md:hidden"
              title="Open menu"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Persistent cart pill (top-right, always visible). Pops the moment
            an item lands in the cart so the AI's work is felt, not assumed. */}
        {onToggleCart && (
          <motion.button
            onClick={onToggleCart}
            animate={cartPopControls}
            className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-2.5 text-xs font-bold text-foreground shadow-lg backdrop-blur-md transition-colors hover:text-primary cursor-pointer"
            aria-label={`Open cart${cartCount > 0 ? ` (${cartCount} item${cartCount === 1 ? "" : "s"})` : ""}`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 1.7 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 480, damping: 16 }}
                className="grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[10px] font-black text-amber-foreground shadow-[0_0_10px_rgba(255,215,0,0.45)]"
              >
                {cartCount}
              </motion.span>
            )}
          </motion.button>
        )}

        {isEmpty ? (
          /* ── Empty-state: eyebrow + greeting + input + suggestion pills ── */
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
            <KaprukaSmileGlow />

            {/* Ambient hero orbs — slow-drifting brand-colour glows (CSS-only,
                pointer-transparent, disabled under prefers-reduced-motion). */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <span className="orb-float absolute -left-24 top-[12%] h-72 w-72 rounded-full bg-primary-vivid/12 blur-3xl" />
              <span className="orb-float-delayed absolute -right-20 bottom-[18%] h-80 w-80 rounded-full bg-amber/10 blur-3xl" />
            </div>

            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
              className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center"
            >
              <motion.span
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/60"
              >
                Kapruka
              </motion.span>

              <motion.h1
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 22 } } }}
                className="mb-3 text-4xl font-black leading-[1.1] tracking-tight text-foreground md:text-5xl"
              >
                Hi, I&apos;m <span className="text-aurora">Ruki</span>
              </motion.h1>

              <motion.p
                variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                className="mb-8 max-w-md text-sm font-semibold text-muted-foreground"
              >
                Your Kapruka gifting co-pilot — always just a message away.
              </motion.p>

              <motion.div
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 24 } } }}
                className="w-full"
              >
                {inputBar}
              </motion.div>

              <motion.div
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
                className="mt-5 flex flex-wrap justify-center gap-2"
              >
                {SUGGESTION_PILLS.map(({ label, icon: Icon }) => (
                  <motion.button
                    key={label}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onSendMessage?.(label)}
                    className="group flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-4 py-2 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary-vivid/50 hover:bg-primary-soft hover:text-foreground hover:shadow-[0_8px_24px_-10px_var(--primary-glow)] cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary-vivid transition-transform duration-300 group-hover:scale-110" />
                    {label}
                  </motion.button>
                ))}
              </motion.div>

              {introComponent && <div className="mt-8 w-full">{introComponent}</div>}
            </motion.div>
          </div>
        ) : (
          /* ── Active conversation ── */
          <>
            <div className="scroll-slim flex-1 overflow-y-auto px-4 py-6 pt-20 md:px-8">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((message) => {
                  const isThinking = message.role === "assistant" && !!message.intents?.includes("THINKING");
                  return (
                  <div key={message.id} className="space-y-4">
                    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      {isThinking ? (
                        <ThinkingIndicator status={message.content} />
                      ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm select-text ${
                          message.role === "user"
                            ? "bg-linear-to-r from-primary-vivid to-primary-vivid-soft text-primary-foreground font-medium"
                            : "bg-primary-soft/60 border border-border/40 text-foreground"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <AssistantContent content={message.content} />
                        ) : (
                          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                        )}
                        {message.role === "assistant" && message.latency !== undefined && message.latency > 0 && (
                          <div className="mt-1.5 text-right text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
                            {message.latency.toFixed(0)}ms
                          </div>
                        )}
                      </div>
                      )}
                    </div>

                    {/* Products carousel */}
                    {message.role === "assistant" && message.products && message.products.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 select-none">
                            {message.products.length} live matches
                          </span>
                        </div>
                        {/* Mobile: horizontal snap carousel · Desktop (sm+): a
                            wrapping grid so cards never run off-screen. */}
                        <div className="scroll-hidden -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0">
                          {message.products.map((p) => (
                            <div key={p.id} className="w-40 shrink-0 snap-start sm:w-auto">
                              <ProductCard product={p} onAdd={() => onAddToCart?.(p)} mode={activeMode} onAddToBox={onAddToBox} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty search / error state */}
                    {message.role === "assistant" && isNoMatchesOrError(message) && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mr-auto max-w-[85%] overflow-hidden rounded-2xl border p-5 text-center shadow-md ${
                          message.isError ? "border-red-500/30 bg-red-500/5 text-foreground" : "border-border bg-surface text-foreground"
                        }`}
                      >
                        {message.isError ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/20 text-red-500 animate-pulse">
                              <AlertCircle className="h-6 w-6" />
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold uppercase tracking-tight text-red-500">Service Error</h4>
                              <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground/80">
                                The Kapruka Ruki AI service encountered an error or the streaming backend is offline. We
                                guarantee you only see real-time availability. Please check back.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <EmptyStateIllustration theme={theme} />
                            <h4 className="text-sm font-extrabold uppercase tracking-tight text-primary select-none">No matching products found</h4>
                            <p className="mt-1 max-w-md text-[11px] font-semibold leading-relaxed text-muted-foreground/80">
                              Ruki AI searched the live Kapruka catalog but found no matching items. Fallback mock products have
                              been disabled to ensure real-time accuracy.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                  );
                })}
                <div ref={chatFeedEndRef} />
              </div>
            </div>

            {/* Bottom input (unbordered, floats over the canvas) */}
            <div className="bg-linear-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-2 md:px-8">
              <div className="mx-auto max-w-3xl">
                {inputBar}
                <div className="mt-2 space-y-0.5 text-center text-[10px] text-muted-foreground/50">
                  <div>Press Enter to send · Shift + Enter for a new line</div>
                  <div>Ruki can make mistakes. Please verify important order details.</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
