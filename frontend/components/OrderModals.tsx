"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, X, Check, ExternalLink, Loader2 } from "lucide-react";
import { CartItem } from "@/components/RightCart";

// ── Pre-checkout Order Modal ──────────────────────────────────────────────────

interface OrderModalProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  total: number;
  recipientName: string;
  setRecipientName: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  onSubmit: () => void;
}

export function OrderModal({
  open,
  onClose,
  cart,
  total,
  recipientName,
  setRecipientName,
  address,
  setAddress,
  phone,
  setPhone,
  isLoading,
  error,
  onSubmit,
}: OrderModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden border border-border"
          >
            <div className="bg-primary text-primary-foreground p-5 flex items-center justify-between">
              <div className="flex items-center gap-2 select-none">
                <ShoppingCart className="h-5 w-5" />
                <span className="font-extrabold tracking-tight">Delivery Details</span>
              </div>
              <button
                id="order-modal-close-btn"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fill in the recipient's details to create your order on Kapruka. A secure payment link will open instantly.
              </p>

              {/* Cart summary */}
              <div className="rounded-xl bg-muted/60 border border-border p-3 space-y-1">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground truncate max-w-[200px]">
                      {item.name} ×{item.quantity}
                    </span>
                    <span className="font-bold text-primary shrink-0">
                      Rs. {(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="border-t border-border mt-2 pt-2 flex justify-between text-xs font-black">
                  <span>Total</span>
                  <span>Rs. {total.toLocaleString()}</span>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                {[
                  { id: "order-recipient-name", label: "Recipient Name *", placeholder: "e.g. Dilanka Perera", value: recipientName, onChange: setRecipientName, type: "text" },
                  { id: "order-delivery-address", label: "Delivery Address *", placeholder: "e.g. 45 Galle Road, Colombo 03", value: address, onChange: setAddress, type: "text" },
                  { id: "order-phone-number", label: "Contact Number *", placeholder: "e.g. 0771234567", value: phone, onChange: setPhone, type: "tel" },
                ].map(f => (
                  <div key={f.id}>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{f.label}</label>
                    <input
                      id={f.id}
                      type={f.type}
                      placeholder={f.placeholder}
                      value={f.value}
                      onChange={e => f.onChange(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-xs font-semibold text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  id="order-cancel-btn"
                  onClick={onClose}
                  className="w-full border border-border text-foreground py-3 rounded-xl text-xs font-bold hover:bg-muted transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="order-submit-btn"
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="w-full rounded-xl py-3 text-xs font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 active:scale-[0.98] disabled:opacity-70 cursor-pointer inline-flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Placing Order...</>
                  ) : (
                    <>Place Order <ExternalLink className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Post-order Checkout Success Modal ─────────────────────────────────────────

interface CheckoutSuccessModalProps {
  open: boolean;
  onClose: () => void;
  checkoutUrl: string | null;
}

export function CheckoutSuccessModal({ open, onClose, checkoutUrl }: CheckoutSuccessModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md bg-surface rounded-2xl shadow-xl overflow-hidden border border-border"
          >
            <div className="bg-primary text-primary-foreground p-5 flex items-center justify-between">
              <div className="flex items-center gap-2 select-none">
                <Check className="h-5 w-5 text-emerald-400 stroke-[3px]" />
                <span className="font-extrabold tracking-tight">Order Created!</span>
              </div>
              <button
                id="checkout-close-btn-top"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your Kapruka order link is ready. The checkout page has been opened in a new tab. Copy the link below to share or revisit.
              </p>

              <div className="bg-muted border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                <input
                  type="text"
                  readOnly
                  value={checkoutUrl || ""}
                  className="flex-1 bg-transparent text-xs font-mono text-muted-foreground outline-none truncate"
                />
                <button
                  id="checkout-copy-btn"
                  onClick={() => { if (checkoutUrl) navigator.clipboard.writeText(checkoutUrl); }}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer shrink-0"
                >
                  Copy
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  id="checkout-close-btn"
                  onClick={onClose}
                  className="w-full border border-border text-foreground py-3 rounded-xl text-xs font-bold hover:bg-muted transition-all cursor-pointer"
                >
                  Close
                </button>
                <a
                  id="checkout-launch-btn"
                  href={checkoutUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer hover:brightness-110"
                  style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
                >
                  Open Checkout
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
