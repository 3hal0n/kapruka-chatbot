"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ShoppingCart,
  Minus,
  Plus,
  PackageOpen,
  Loader2,
  Users,
} from "lucide-react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
  url?: string; // real Kapruka product-page URL for direct checkout
}

interface RightCartProps {
  cart: CartItem[];
  subtotal: number;
  delivery: number;
  total: number;
  updateQuantity: (id: string, delta: number) => void;
  handleCreateOrderLink: () => void;
  open: boolean;
  onClose: () => void;
  isOrderLoading?: boolean;
  onGroupGift?: () => void;
}

export function RightCart({
  cart,
  subtotal,
  delivery,
  total,
  updateQuantity,
  handleCreateOrderLink,
  open,
  onClose,
  isOrderLoading = false,
  onGroupGift,
}: RightCartProps) {
  const content = (
    <div className="flex h-full w-[340px] max-w-[88vw] shrink-0 flex-col gap-4 overflow-hidden border-l border-border bg-background/95 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground select-none">
          <ShoppingCart className="h-5 w-5 text-amber" /> Your Cart
        </h2>
        <button
          id="cart-close-btn"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-300 hover:bg-muted cursor-pointer"
          aria-label="Close cart"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto pr-0.5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface p-6 text-center shadow-sm select-none">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft">
              <PackageOpen className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-foreground">Your cart is empty</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                Ask Ruki for a gift or tap <span className="font-bold text-primary">Add to Cart</span> on any product, then buy it on Kapruka.
              </p>
            </div>
            <div className="w-full space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-2 rounded-xl border border-border bg-muted/40 p-2">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
                  <div className="flex flex-1 flex-col justify-center gap-1.5">
                    <div className="h-2 w-3/4 rounded-full bg-muted animate-pulse" />
                    <div className="h-2 w-1/2 rounded-full bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {cart.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
              >
                <img
                  src={item.image_url}
                  alt={item.name}
                  loading="lazy"
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded-xl object-cover bg-slate-50"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-extrabold">{item.name}</h3>
                    <p className="text-xs font-bold text-primary">Rs. {item.price.toLocaleString()}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <button
                      id={`cart-dec-${item.id.toLowerCase().replace(/_/g, "-")}`}
                      onClick={() => updateQuantity(item.id, -1)}
                      className="grid h-6 w-6 place-items-center rounded-md border border-border bg-surface text-foreground transition-all duration-300 hover:bg-muted cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="min-w-5 text-center text-sm font-bold select-none">{item.quantity}</span>
                    <button
                      id={`cart-inc-${item.id.toLowerCase().replace(/_/g, "-")}`}
                      onClick={() => updateQuantity(item.id, 1)}
                      className="grid h-6 w-6 place-items-center rounded-md border border-border bg-surface text-foreground transition-all duration-300 hover:bg-muted cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="rounded-2xl bg-linear-to-br from-primary-vivid to-primary-vivid-soft p-4 text-primary-foreground shadow-md">
        <div className="flex items-center justify-between py-1 text-sm select-none">
          <span className="font-medium opacity-90">Subtotal</span>
          <span className="font-bold">Rs. {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between py-1 text-sm select-none">
          <span className="font-medium opacity-90">Delivery</span>
          <span className="font-bold">Rs. {delivery.toLocaleString()}</span>
        </div>
        <div className="my-3 h-px bg-white/20" />
        <div className="flex items-baseline justify-between select-none">
          <span className="text-xl font-extrabold tracking-tight">Total</span>
          <span className="text-xl font-extrabold">Rs. {total.toLocaleString()}</span>
        </div>
        <button
          id="create-order-link-btn"
          onClick={handleCreateOrderLink}
          disabled={cart.length === 0 || isOrderLoading}
          className="mt-4 w-full rounded-xl py-3 text-sm font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,215,0,0.5)] active:scale-[0.98] disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2"
          style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
        >
          {isOrderLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Opening Kapruka...</>
          ) : (
            "Buy on Kapruka"
          )}
        </button>

        {/* Group Gift — split costs with friends */}
        <button
          id="group-gift-btn"
          onClick={onGroupGift}
          disabled={cart.length === 0}
          className="mt-2 w-full rounded-xl py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2 border border-white/20 bg-white/10 text-white transition-all duration-300 hover:bg-white/20 active:scale-[0.98] disabled:opacity-40 cursor-pointer"
        >
          <Users className="h-4 w-4" />
          Split with Friends
        </button>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute inset-y-0 right-0 shadow-2xl shadow-black/40"
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
