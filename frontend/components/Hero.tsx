"use client";

import React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Plus, Clock, ArrowRight } from "lucide-react";
import { Orb } from "@/components/ui/orb";

interface HeroProps {
  theme: "light" | "dark";
  chatHistory?: { id: string; title: string; date: string }[];
  onSelectHistory?: (id: string) => void;
  onStartNewChat?: () => void;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 220, damping: 24 } },
};

export function Hero({ theme, chatHistory = [], onSelectHistory, onStartNewChat }: HeroProps) {
  const orbBg = theme === "dark" ? "#0A0A0B" : "#ffffff";

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-5xl px-4 py-8 select-none"
    >
      <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-16 items-center">
        
        {/* Left Column: Sentient WebGL Orb Identity Center & Greeting */}
        <div className="md:col-span-7 flex flex-col items-center text-center md:text-left md:items-start space-y-6">
          <motion.div 
            variants={item} 
            className="h-44 w-44 md:h-52 md:w-52 relative flex items-center justify-center mx-auto md:mx-0"
          >
            <Orb 
              hoverIntensity={0.5} 
              rotateOnHover={true}
              hue={270} // Soft purple/violet hue to match Kapruka branding
              backgroundColor={orbBg}
              className="h-full w-full"
            />
          </motion.div>

          <div className="space-y-3">
            <motion.h2
              variants={item}
              className="text-lg font-extrabold uppercase tracking-widest text-primary/80"
            >
              Hey I'm Ruki
            </motion.h2>
            
            <motion.h1
              variants={item}
              className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl leading-tight text-foreground"
            >
              How can I help today?
            </motion.h1>
            
            <motion.p
              variants={item}
              className="text-xs md:text-sm font-semibold text-muted-foreground max-w-md leading-relaxed"
            >
              Type a command or ask a question to get the best out of kapruka
            </motion.p>
          </div>
        </div>

        {/* Right Column: Quick Actions Block */}
        <motion.div 
          variants={item}
          className="md:col-span-5 w-full flex flex-col space-y-6"
        >
          {/* Card Wrapper matching the premium design image */}
          <div className="rounded-3xl border border-border/40 bg-surface-glass/40 p-6 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-border/20 pb-4 mb-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Plus className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                Quick Actions
              </h3>
            </div>

            <div className="space-y-4">
              {/* Start New Chat Button */}
              <button
                onClick={onStartNewChat}
                className="group flex w-full items-center justify-between rounded-2xl bg-primary px-4 py-3.5 text-xs font-black text-primary-foreground shadow-sm hover:opacity-95 transition-all duration-300 cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquare className="h-4 w-4" />
                  Start new chat
                </span>
                <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Recent Chats Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  <Clock className="h-3 w-3" />
                  Recent
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto scroll-slim">
                  {chatHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/30 bg-muted/5 py-8 text-center text-xs font-bold text-muted-foreground/50">
                      No chats yet
                    </div>
                  ) : (
                    chatHistory.slice(0, 3).map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => onSelectHistory?.(chat.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/10 bg-surface/50 p-3 text-left text-xs transition-all duration-300 hover:bg-primary-soft hover:border-border/40 group cursor-pointer"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-600/10 text-purple-500 group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground/90 truncate group-hover:text-primary transition-colors">
                            {chat.title}
                          </p>
                          <span className="text-[9px] text-muted-foreground/60">
                            {chat.date}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
