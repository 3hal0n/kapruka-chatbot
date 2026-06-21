"use client";

import React from "react";
import { motion } from "framer-motion";

interface ShoppingContextCardProps {
  budget: string;
  setBudget: (b: string) => void;
  recipient: string;
  setRecipient: (r: string) => void;
  occasion: string;
  setOccasion: (o: string) => void;
  onContextUpdated?: (type: "budget" | "recipient" | "occasion", value: string) => void;
}

const BUDGETS = ["Under Rs. 2,500", "Rs. 2,500 - 5,000", "Rs. 5,000 - 10,000", "Above Rs. 10,000"];
const RECIPIENTS = ["Male", "Female", "Child", "Couple"];
const OCCASIONS = ["Birthday", "Anniversary", "Christmas", "Mother's Day"];

export function ShoppingContextCard({
  budget,
  setBudget,
  recipient,
  setRecipient,
  occasion,
  setOccasion,
  onContextUpdated,
}: ShoppingContextCardProps) {

  const handleSelect = (type: "budget" | "recipient" | "occasion", val: string) => {
    if (type === "budget") setBudget(val);
    if (type === "recipient") setRecipient(val);
    if (type === "occasion") setOccasion(val);
    if (onContextUpdated) {
      onContextUpdated(type, val);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4"
    >
      <div>
        <h4 className="text-base font-extrabold tracking-tight text-primary">Set shopping context</h4>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          I detected details from your message and only need anything missing before answering it.
        </p>
      </div>

      <ContextRow 
        title="What is your budget?" 
        items={BUDGETS} 
        value={budget} 
        onClick={(val) => handleSelect("budget", val)} 
      />
      <ContextRow 
        title="Who is the recipient?" 
        items={RECIPIENTS} 
        value={recipient} 
        onClick={(val) => handleSelect("recipient", val)} 
      />
      <ContextRow 
        title="What is the occasion?" 
        items={OCCASIONS} 
        value={occasion} 
        onClick={(val) => handleSelect("occasion", val)} 
      />
    </motion.div>
  );
}

interface ContextRowProps {
  title: string;
  items: string[];
  value: string;
  onClick: (val: string) => void;
}

function ContextRow({ title, items, value, onClick }: ContextRowProps) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-sm font-bold text-foreground select-none">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = value === item;
          return (
            <motion.button
              key={item}
              onClick={() => onClick(item)}
              whileTap={{ scale: 0.96 }}
              animate={{
                backgroundColor: active ? "#FFD700" : "rgba(255, 255, 255, 0.03)",
                color: active ? "#0B0410" : "#E9D5FF",
                borderColor: active ? "#FFD700" : "rgba(255, 255, 255, 0.1)",
              }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm cursor-pointer border-border"
            >
              {item}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
