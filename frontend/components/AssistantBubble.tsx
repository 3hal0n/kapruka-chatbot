"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface AssistantBubbleProps {
  children: React.ReactNode;
  intents?: string[];
  latency?: number;
}

export function AssistantBubble({ children, intents, latency }: AssistantBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex max-w-[85%] gap-3 items-start mr-auto"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm select-none">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-md border border-border bg-primary-soft px-4 py-3 text-sm font-medium leading-relaxed text-foreground shadow-sm">
        <div className="whitespace-pre-line">{children}</div>
        
        {/* Intent indicators and latency tags */}
        {intents && intents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-border select-none">
            {intents.map(intent => (
              <span key={intent} className="text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full font-sans">
                {intent} intent
              </span>
            ))}
            {latency !== undefined && latency > 0 && (
              <span className="text-[10px] font-bold text-muted-foreground ml-auto">
                Latency: {latency}s
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
