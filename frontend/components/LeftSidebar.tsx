"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronDown, 
  Sun, 
  Wallet, 
  User, 
  PartyPopper,
  Compass,
  Layers,
  Gift,
  ArrowRightLeft,
  FileSearch,
  MessageSquareDot,
  ShoppingBag
} from "lucide-react";

export type Mode =
  | "Smart Shopping"
  | "Event Planner"
  | "Gift Box Builder"
  | "Product Compare"
  | "Order Tracking"
  | "Gift Message";

export const MODES: { label: Mode; icon: React.ComponentType<any> }[] = [
  { label: "Smart Shopping", icon: Compass },
  { label: "Event Planner", icon: Layers },
  { label: "Gift Box Builder", icon: Gift },
  { label: "Product Compare", icon: ArrowRightLeft },
  { label: "Order Tracking", icon: FileSearch },
  { label: "Gift Message", icon: MessageSquareDot },
];

interface LeftSidebarProps {
  mode: Mode;
  setMode: (m: Mode) => void;
  budget: string;
  setBudget: (b: string) => void;
  recipient: string;
  setRecipient: (r: string) => void;
  occasion: string;
  setOccasion: (o: string) => void;
  open: boolean;
  onClose: () => void;
}

export function LeftSidebar({
  mode,
  setMode,
  budget,
  setBudget,
  recipient,
  setRecipient,
  occasion,
  setOccasion,
  open,
  onClose,
}: LeftSidebarProps) {
  const content = (
    <div className="flex h-full w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-background p-4 select-none">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight leading-none text-primary">
          Kapruka <span style={{ color: "oklch(0.72 0.16 85)" }}>Genie</span>
        </h1>
        <button 
          id="sidebar-close-btn-mobile"
          onClick={onClose} 
          className="md:hidden grid h-9 w-9 place-items-center rounded-xl transition-all duration-300 hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Modes Panel */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold tracking-tight">Modes</h2>
          <Sun className="h-4 w-4 text-muted-foreground" />
        </div>
        <nav className="flex flex-col gap-1">
          {MODES.map(({ label, icon: Icon }) => {
            const active = mode === label;
            return (
              <button
                key={label}
                id={`mode-btn-${label.toLowerCase().replace(/ /g, "-")}`}
                onClick={() => {
                  setMode(label);
                  onClose();
                }}
                className={
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-300 ease-in-out " +
                  (active
                    ? "bg-primary text-white shadow-sm shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted")
                }
              >
                <Icon className={"h-4 w-4 " + (active ? "text-amber" : "text-muted-foreground")} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Preferences Panel */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold tracking-tight">Preferences</h2>
        <div className="space-y-2.5">
          {/* Budget Selection */}
          <div>
            <label htmlFor="budget-select" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Budget</label>
            <div className="relative">
              <Wallet className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select 
                id="budget-select"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-surface py-1.5 pl-8 pr-7 text-sm font-semibold outline-none transition-all duration-300 ease-in-out hover:bg-muted focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Any budget</option>
                <option value="Under Rs. 2,500">Under Rs. 2,500</option>
                <option value="Rs. 2,500 - 5,000">Rs. 2,500 - 5,000</option>
                <option value="Rs. 5,000 - 10,000">Rs. 5,000 - 10,000</option>
                <option value="Above Rs. 10,000">Above Rs. 10,000</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Recipient Selection */}
          <div>
            <label htmlFor="recipient-select" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Recipient</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select 
                id="recipient-select"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-surface py-1.5 pl-8 pr-7 text-sm font-semibold outline-none transition-all duration-300 ease-in-out hover:bg-muted focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Anyone</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Child">Child</option>
                <option value="Couple">Couple</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Occasion Selection */}
          <div>
            <label htmlFor="occasion-select" className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Occasion</label>
            <div className="relative">
              <PartyPopper className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select 
                id="occasion-select"
                value={occasion}
                onChange={e => setOccasion(e.target.value)}
                className="w-full appearance-none rounded-lg border border-border bg-surface py-1.5 pl-8 pr-7 text-sm font-semibold outline-none transition-all duration-300 ease-in-out hover:bg-muted focus:ring-2 focus:ring-ring/40"
              >
                <option value="">Any occasion</option>
                <option value="Birthday">Birthday</option>
                <option value="Anniversary">Anniversary</option>
                <option value="Christmas">Christmas</option>
                <option value="Mother's Day">Mother's Day</option>
                <option value="Father's Day">Father's Day</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex h-full">{content}</aside>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.25 }}
              className="absolute inset-y-0 left-0"
            >
              {content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
