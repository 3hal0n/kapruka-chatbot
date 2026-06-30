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
  theme: "light" | "dark";
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
  theme,
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
      className="glass glow-primary rounded-2xl p-5 space-y-4"
    >
      <div>
        <h4 className="text-base font-extrabold tracking-tight text-foreground">Set shopping context</h4>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          I detected details from your message and only need anything missing before answering it.
        </p>
      </div>

      <ContextRow 
        title="What is your budget?" 
        items={BUDGETS} 
        value={budget} 
        onClick={(val) => handleSelect("budget", val)} 
        theme={theme}
      />
      <ContextRow 
        title="Who is the recipient?" 
        items={RECIPIENTS} 
        value={recipient} 
        onClick={(val) => handleSelect("recipient", val)} 
        theme={theme}
      />
      <ContextRow 
        title="What is the occasion?" 
        items={OCCASIONS} 
        value={occasion} 
        onClick={(val) => handleSelect("occasion", val)} 
        theme={theme}
      />
    </motion.div>
  );
}

interface ContextRowProps {
  title: string;
  items: string[];
  value: string;
  onClick: (val: string) => void;
  theme: "light" | "dark";
}

function ContextRow({ title, items, value, onClick, theme }: ContextRowProps) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-sm font-bold text-foreground select-none">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = value === item;
          
          // 60-30-10: active selection uses the Kapruka Purple brand colour
          // (gold is reserved exclusively for conversion CTAs).
          let bgVal = "rgba(255, 255, 255, 0.03)";
          let colorVal = "#C8B3E4";
          let borderVal = "rgba(255, 255, 255, 0.1)";

          if (theme === "light") {
            bgVal = active ? "#3C1B63" : "#F9FAFB";
            colorVal = active ? "#ffffff" : "#4B5563";
            borderVal = active ? "#3C1B63" : "#D1D5DB";
          } else {
            bgVal = active ? "#3C1B63" : "rgba(255, 255, 255, 0.04)";
            colorVal = active ? "#ffffff" : "#C8B3E4";
            borderVal = active ? "#6D28D9" : "rgba(255, 255, 255, 0.1)";
          }

          return (
            <motion.button
              key={item}
              onClick={() => onClick(item)}
              whileTap={{ scale: 0.96 }}
              animate={{
                backgroundColor: bgVal,
                color: colorVal,
                borderColor: borderVal,
              }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm cursor-pointer"
            >
              {item}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
