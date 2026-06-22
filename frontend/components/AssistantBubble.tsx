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
  const renderFormattedText = (text: React.ReactNode) => {
    if (typeof text !== "string") return text;
    
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      // Number list matches (e.g. "1. Recipient's Name")
      const listMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (listMatch) {
        const num = listMatch[1];
        const content = listMatch[2];
        return (
          <div key={idx} className="flex gap-2 my-1 leading-relaxed text-foreground select-text">
            <span className="font-extrabold text-primary min-w-[18px]">{num}.</span>
            <span className="font-medium">{content}</span>
          </div>
        );
      }
      
      // Bullet list matches (e.g. "* ", "- ")
      const bulletMatch = line.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        const content = bulletMatch[1];
        return (
          <div key={idx} className="flex gap-2 my-1 leading-relaxed text-foreground pl-3 select-text">
            <span className="text-primary font-black">•</span>
            <span className="font-medium">{content}</span>
          </div>
        );
      }
      
      // Default line
      return (
        <p key={idx} className="min-h-[1.25rem] leading-relaxed break-words whitespace-pre-wrap select-text">
          {line}
        </p>
      );
    });
  };

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
        <div className="flex flex-col space-y-1">{renderFormattedText(children)}</div>
        
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
