"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Check, Share2, MessageCircle, Users } from "lucide-react";
import { CartItem } from "./RightCart";

interface GroupGiftModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string;
  cart: CartItem[];
  total: number;
}

export function GroupGiftModal({ open, onClose, shareUrl, cart, total }: GroupGiftModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hey! Let's co-gift together on Kapruka 🎁 Join here: ${shareUrl}`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Group Gift — Kapruka",
          text: "Join me in co-gifting!",
          url: shareUrl,
        });
      } catch {
        /* user cancelled share dialog */
      }
    } else {
      handleCopy();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-tight text-foreground">
                    Group Gift
                  </h2>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Split costs with friends &amp; family
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-xl transition-all hover:bg-muted cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Cart summary */}
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Cart Summary
                </p>
                {cart.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-9 w-9 shrink-0 rounded-lg object-cover bg-muted"
                    />
                    <span className="flex-1 truncate text-xs font-semibold text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      ×{item.quantity}
                    </span>
                  </div>
                ))}
                {cart.length > 3 && (
                  <p className="text-xs text-muted-foreground pl-11">
                    +{cart.length - 3} more items
                  </p>
                )}
                <div className="flex justify-between border-t border-border pt-2 mt-1">
                  <span className="text-xs font-bold text-muted-foreground">Total</span>
                  <span className="text-xs font-black text-primary">
                    Rs.&nbsp;{total.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Shareable link */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Shareable Group Link
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 truncate rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] font-mono text-muted-foreground select-all">
                    {shareUrl}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Share action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.97] cursor-pointer"
                  style={{ backgroundColor: "#25D366" }}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  onClick={handleNativeShare}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted py-2.5 text-sm font-bold transition-all hover:bg-muted/80 active:scale-[0.97] cursor-pointer"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>

              <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                Anyone with this link can view and co-contribute to this gift cart
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
