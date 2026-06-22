"use client";

import React from "react";
import { motion } from "framer-motion";

interface UserBubbleProps {
  children: React.ReactNode;
}

export function UserBubble({ children }: UserBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-end ml-auto"
    >
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm break-words whitespace-pre-wrap select-text">
        {children}
      </div>
    </motion.div>
  );
}
