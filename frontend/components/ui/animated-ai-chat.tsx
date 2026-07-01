"use client";

import * as React from "react";
import {
  ArrowUp,
  Paperclip,
  Mic,
  Volume2,
  VolumeX,
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
  Truck,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ProductCard, Product } from "@/components/ProductCard";
import { KaprukaSmileGlow } from "@/components/ui/kapruka-smile-glow";
import { RukiLogo } from "@/components/ui/logo";

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
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  isAudioMuted?: boolean;
  onToggleMute?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatHistory?: { id: string; title: string; date: string }[];
  onSelectHistoryItem?: (id: string) => void;
  onStartNewChat?: () => void;
  introComponent?: React.ReactNode;

  // Theme & tools (hosted in the sidebar, not a top navbar)
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onClearHistory?: () => void;
  onToggleCart?: () => void;
  cartCount?: number;
  guestId?: string;

  // Gifting flow props
  onAddToCart?: (product: Product) => void;
  onAddToBox?: (product: Product, rect: DOMRect) => void;
  activeMode?: string;
}

// Ruki quick-start suggestions — mirrors the Kapruka gifting shortcuts
const SUGGESTION_PILLS: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Find gift for friend", icon: Gift },
  { label: "Send flowers", icon: Flower },
  { label: "Deals & monitors", icon: Percent },
  { label: "Track last order", icon: Truck },
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
    const t = setInterval(() => setIdx((p) => (p + 1) % THINKING_PHRASES.length), 1900);
    return () => clearInterval(t);
  }, []);

  // A specific backend status (e.g. delivery / profile refinement) takes over;
  // otherwise Ruki playfully cycles through the phrase list.
  const label = status && status.trim() ? status : `Ruki is ${THINKING_PHRASES[idx]}`;

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-primary-soft/60 px-4 py-3 text-sm text-foreground">
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-primary-vivid animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
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
  isRecording = false,
  onStartRecording,
  onStopRecording,
  isAudioMuted = true,
  onToggleMute,
  sidebarOpen = false,
  onToggleSidebar,
  chatHistory = [],
  onSelectHistoryItem,
  onStartNewChat,
  introComponent,
  theme = "light",
  onToggleTheme,
  onClearHistory,
  onToggleCart,
  cartCount = 0,
  guestId,
  onAddToCart,
  onAddToBox,
  activeMode = "Smart Shopping",
}: AnimatedAIChatProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const chatFeedEndRef = React.useRef<HTMLDivElement>(null);

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
    <div
      className={`relative flex items-end gap-2 rounded-[28px] border bg-surface/60 px-3 py-2 backdrop-blur-md transition-all duration-300 ${
        isFocused
          ? "border-primary/50 bg-surface shadow-[0_0_0_4px_rgba(124,58,173,0.14),0_14px_44px_-14px_rgba(60,27,99,0.4)]"
          : "border-border shadow-sm"
      }`}
    >
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer"
        title="Attach media"
        type="button"
      >
        <Paperclip className="h-4 w-4" />
      </button>

      <textarea
        ref={textareaRef}
        rows={1}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="What's on your mind?"
        className="max-h-32 min-h-[24px] flex-1 resize-none self-center overflow-y-auto bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 select-text"
      />

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          title="Smart suggestions"
          className="hidden h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer sm:flex"
        >
          <Sparkles className="h-4 w-4" />
        </button>

        <button
          onMouseDown={onStartRecording}
          onMouseUp={onStopRecording}
          onMouseLeave={onStopRecording}
          onTouchStart={onStartRecording}
          onTouchEnd={onStopRecording}
          type="button"
          className={`flex h-9 w-9 touch-none select-none items-center justify-center rounded-full transition-colors cursor-pointer ${
            isRecording
              ? "bg-red-500 text-white animate-pulse"
              : "text-muted-foreground hover:bg-primary-soft hover:text-foreground"
          }`}
          title="Hold to record voice transcription"
          aria-label="Hold to talk"
        >
          <Mic className="h-4 w-4" />
        </button>

        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          type="button"
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-all cursor-pointer ${
            inputValue.trim()
              ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
              : "bg-muted text-muted-foreground/50 cursor-not-allowed"
          }`}
          aria-label="Send"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
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
            {chatHistory.map((chatItem) => (
              <button
                key={chatItem.id}
                onClick={() => {
                  onSelectHistoryItem?.(chatItem.id);
                  onCloseMobile?.();
                }}
                className="flex w-full flex-col gap-0.5 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-300 hover:border-border/30 hover:bg-primary-soft cursor-pointer"
              >
                <span className="truncate text-xs font-bold text-foreground/90">{chatItem.title}</span>
                <span className="text-[10px] text-muted-foreground/60">{chatItem.date}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Utility tray */}
      <div className={`shrink-0 space-y-0.5 border-t border-border p-3 ${collapsed ? "px-2" : ""}`}>
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
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            title="Toggle voice output"
            className={collapsed ? "flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer mx-auto" : toolBtn}
          >
            {isAudioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-primary" />}
            {!collapsed && (
              <>
                Voice output
                <span className="ml-auto text-[10px] font-black uppercase tracking-wider opacity-70">
                  {isAudioMuted ? "Off" : "On"}
                </span>
              </>
            )}
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

      {/* Guest / session card */}
      <div className={`shrink-0 border-t border-border p-3 ${collapsed ? "px-2" : ""}`}>
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
        {/* Floating mobile sidebar toggle (upper-left) */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={onToggleSidebar}
              className="glass absolute left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground cursor-pointer md:hidden"
              title="Open menu"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Persistent cart pill (top-right, always visible) */}
        {onToggleCart && (
          <button
            onClick={onToggleCart}
            className="glass absolute right-4 top-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:text-primary cursor-pointer"
            aria-label="Open cart"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[10px] font-black text-amber-foreground">
                {cartCount}
              </span>
            )}
          </button>
        )}

        {isEmpty ? (
          /* ── Empty-state: eyebrow + greeting + input + suggestion pills ── */
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
            <KaprukaSmileGlow />

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
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
                  >
                    <Icon className="h-3.5 w-3.5" />
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
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-primary-soft/60 border border-border/40 text-foreground"
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
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
                        <div className="scroll-hidden -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3">
                          {message.products.map((p) => (
                            <div key={p.id} className="w-60 shrink-0 snap-start sm:w-64">
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
                <div className="mt-2 text-center text-[10px] text-muted-foreground/50">
                  Press Enter to send · Shift + Enter for a new line
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
