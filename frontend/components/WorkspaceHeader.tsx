"use client";

import React from "react";
import { ChevronDown, Trash2, Sun, Moon } from "lucide-react";
import { Mode } from "@/components/LeftSidebar";

interface WorkspaceHeaderProps {
  mode: Mode;
  language: string;
  setLanguage: (l: string) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onClearHistory: () => void;
}

export function WorkspaceHeader({
  mode,
  language,
  setLanguage,
  theme,
  toggleTheme,
  onClearHistory,
}: WorkspaceHeaderProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:flex sm:flex-wrap sm:justify-between md:px-6 md:py-4 select-none">
      <h2 className="truncate text-lg font-extrabold tracking-tight md:text-xl">{mode}</h2>
      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            id="language-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="appearance-none rounded-xl border border-border bg-surface py-2 pl-3 pr-8 text-sm font-semibold outline-none transition-all duration-300 ease-in-out hover:bg-muted focus:ring-2 focus:ring-ring/40 cursor-pointer"
          >
            <option value="English">English</option>
            <option value="සිංහල">සිංහල</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>

        <button
          id="clear-history-btn"
          onClick={onClearHistory}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Clear history</span>
        </button>

        <button
          id="theme-toggle-btn-desktop"
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
