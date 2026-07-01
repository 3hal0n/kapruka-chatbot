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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ProductCard, Product } from "@/components/ProductCard";

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
  introComponent?: React.ReactNode;

  // Theme & tools (now hosted in the sidebar bottom, not a top navbar)
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onClearHistory?: () => void;
  onToggleCart?: () => void;
  cartCount?: number;

  // Gifting flow props
  onAddToCart?: (product: Product) => void;
  onAddToBox?: (product: Product, rect: DOMRect) => void;
  activeMode?: string;
}

// Octo-style quick-start suggestions
const SUGGESTION_PILLS = [
  "Find gift for friend",
  "Send flowers",
  "Deals & monitors",
  "Track last order",
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

/**
 * GeminiAuroraMesh — a fluid, breathing radial glow behind the greeting.
 * Kapruka-purple dominant, whisper-subtle so it reads premium (not muddy) on
 * both the white light canvas and the carbon-black dark canvas.
 */
function GeminiAuroraMesh() {
  return (
    <div aria-hidden="true" className="lab-bg pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px]"
        style={{ background: "radial-gradient(circle, rgba(60,27,99,0.20), transparent 65%)" }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[38%] top-[40%] h-[360px] w-[360px] rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(124,58,173,0.18), transparent 60%)" }}
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[58%] top-[54%] h-[300px] w-[300px] rounded-full blur-[90px]"
        style={{ background: "radial-gradient(circle, rgba(147,112,219,0.14), transparent 60%)" }}
        animate={{ x: [0, -30, 20, 0], y: [0, 20, -20, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
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
  introComponent,
  theme = "light",
  onToggleTheme,
  onClearHistory,
  onToggleCart,
  cartCount = 0,
  onAddToCart,
  onAddToBox,
  activeMode = "Smart Shopping",
}: AnimatedAIChatProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
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
        placeholder="Ask Ruki anything — gifts, flowers, deals, delivery…"
        className="max-h-32 min-h-[24px] flex-1 resize-none self-center overflow-y-auto bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 select-text"
      />

      <div className="flex shrink-0 items-center gap-1.5">
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

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background text-foreground select-none">
      {/* Slide-out chat history sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="absolute bottom-0 left-0 top-0 z-50 flex w-[280px] flex-col border-r border-border bg-background/95 backdrop-blur-xl md:relative"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-foreground">
                <History className="h-4 w-4 text-primary" />
                History
              </span>
              <button
                onClick={onToggleSidebar}
                className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground cursor-pointer"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* New chat */}
            {onClearHistory && (
              <div className="px-3 pb-2">
                <button
                  onClick={onClearHistory}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-xs font-bold text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary-soft active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  New chat
                </button>
              </div>
            )}

            {/* Chat log history array */}
            <div className="scroll-slim flex-1 space-y-1.5 overflow-y-auto p-3">
              {chatHistory.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-center text-xs font-semibold text-muted-foreground/60">
                  No previous chats yet
                </div>
              ) : (
                chatHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectHistoryItem?.(item.id)}
                    className="flex w-full flex-col gap-1 rounded-xl border border-transparent px-3 py-3 text-left text-xs transition-all duration-300 hover:border-border/30 hover:bg-primary-soft cursor-pointer"
                  >
                    <span className="truncate font-bold text-foreground/90">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground/60">{item.date}</span>
                  </button>
                ))
              )}
            </div>

            {/* ── Bottom tool tray: theme · clear · voice · cart ── */}
            <div className="space-y-0.5 border-t border-border p-3">
              {onToggleTheme && (
                <button onClick={onToggleTheme} className={toolBtn} title="Toggle theme">
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </button>
              )}
              {onToggleMute && (
                <button onClick={onToggleMute} className={toolBtn} title="Toggle voice output">
                  {isAudioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-primary" />}
                  Voice output
                  <span className="ml-auto text-[10px] font-black uppercase tracking-wider opacity-70">
                    {isAudioMuted ? "Off" : "On"}
                  </span>
                </button>
              )}
              {onClearHistory && (
                <button onClick={onClearHistory} className={toolBtn} title="Clear chat">
                  <Trash2 className="h-4 w-4" />
                  Clear chat
                </button>
              )}
              {onToggleCart && (
                <button onClick={onToggleCart} className={toolBtn} title="Open cart">
                  <ShoppingCart className="h-4 w-4" />
                  Cart
                  {cartCount > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[10px] font-bold text-amber-foreground">
                      {cartCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Full-canvas conversation surface — no top navbar */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Floating minimalist sidebar toggle (upper-left) */}
        <AnimatePresence>
          {!sidebarOpen && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={onToggleSidebar}
              className="glass absolute left-4 top-4 z-40 grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              title="Open history"
              aria-label="Open history"
            >
              <Menu className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {isEmpty ? (
          /* ── Octo empty-state: centered greeting + input + suggestion pills ── */
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
            <GeminiAuroraMesh />

            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
              className="relative z-10 flex w-full max-w-2xl flex-col items-center text-center"
            >
              <motion.h1
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 22 } } }}
                className="mb-8 text-4xl font-black leading-[1.1] tracking-tight text-foreground md:text-5xl"
              >
                How can I help today?
              </motion.h1>

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
                {SUGGESTION_PILLS.map((pill) => (
                  <motion.button
                    key={pill}
                    variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onSendMessage?.(pill)}
                    className="rounded-full border border-border bg-surface/60 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
                  >
                    {pill}
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
                {messages.map((message) => (
                  <div key={message.id} className="space-y-4">
                    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
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
                ))}
                <div ref={chatFeedEndRef} />
              </div>
            </div>

            {/* Bottom input (unbordered, floats over the canvas) */}
            <div className="bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-2 md:px-8">
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
