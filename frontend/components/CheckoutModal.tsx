"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Phone, User, MessageSquareText, Loader2, CheckCircle2, ExternalLink, AlertTriangle } from "lucide-react";
import { CartItem } from "./RightCart";

export interface CheckoutDetails {
  recipientName: string;
  deliveryAddress: string;
  contactNumber: string;
  city: string;
  giftMessage?: string;
}

export interface CheckoutResult {
  status: "success" | "no_link" | "error";
  checkoutUrl?: string | null;
  orderId?: string | null;
  message: string;
}

export interface CheckoutPrefill {
  recipientName?: string;
  deliveryAddress?: string;
  contactNumber?: string;
  giftMessage?: string;
}

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  subtotal: number;
  delivery: number;
  total: number;
  prefill?: CheckoutPrefill;
  /** When set, the modal opens straight to the result screen (e.g. Ruki already
   *  placed the order conversationally — this just shows the confirmation). */
  autoResult?: CheckoutResult;
  onSubmit: (details: CheckoutDetails) => Promise<CheckoutResult>;
  /** Escape hatch: open each cart item's real Kapruka product page directly. */
  onOpenProductPages: () => void;
}

const CITIES = ["Colombo", "Kandy", "Galle", "Jaffna", "Negombo", "Gampaha", "Kotte", "Dehiwala", "Moratuwa", "Nugegoda"];

export function CheckoutModal({
  open,
  onClose,
  cart,
  subtotal,
  delivery,
  total,
  prefill,
  autoResult,
  onSubmit,
  onOpenProductPages,
}: CheckoutModalProps) {
  const [recipientName, setRecipientName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [city, setCity] = useState("Colombo");
  const [giftMessage, setGiftMessage] = useState("");
  const [phase, setPhase] = useState<"form" | "submitting" | "result">("form");
  const [result, setResult] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    if (!open) return;
    if (autoResult) {
      setResult(autoResult);
      setPhase("result");
      return;
    }
    setRecipientName(prefill?.recipientName || "");
    setDeliveryAddress(prefill?.deliveryAddress || "");
    setContactNumber(prefill?.contactNumber || "");
    setGiftMessage(prefill?.giftMessage || "");
    setPhase("form");
    setResult(null);
  }, [open, prefill, autoResult]);

  const canSubmit =
    recipientName.trim().length > 1 &&
    deliveryAddress.trim().length > 5 &&
    contactNumber.trim().length >= 9 &&
    cart.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPhase("submitting");
    try {
      const res = await onSubmit({
        recipientName: recipientName.trim(),
        deliveryAddress: deliveryAddress.trim(),
        contactNumber: contactNumber.trim(),
        city,
        giftMessage: giftMessage.trim() || undefined,
      });
      setResult(res);
      setPhase("result");
      if (res.status === "success" && res.checkoutUrl) {
        window.open(res.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setResult({ status: "error", message: "Something went wrong reaching Kapruka. Please try again." });
      setPhase("result");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-70 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-black tracking-tight text-foreground">Complete your order</h2>
                <p className="text-[11px] font-medium text-muted-foreground">
                  {cart.length} item{cart.length === 1 ? "" : "s"} · Rs. {total.toLocaleString()}
                </p>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-xl transition-all hover:bg-muted cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto scroll-slim p-6 space-y-4">
              {phase !== "result" ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="checkout-recipient" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <User className="h-3 w-3" /> Recipient name
                    </label>
                    <input
                      id="checkout-recipient"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Who is this delivered to?"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="checkout-address" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <MapPin className="h-3 w-3" /> Delivery address
                    </label>
                    <textarea
                      id="checkout-address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Street, house number, landmark..."
                      rows={2}
                      className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="checkout-phone" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <Phone className="h-3 w-3" /> Contact number
                      </label>
                      <input
                        id="checkout-phone"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="07XXXXXXXX"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-ring/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="checkout-city" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        City
                      </label>
                      <select
                        id="checkout-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-ring/40"
                      >
                        {CITIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="checkout-note" className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <MessageSquareText className="h-3 w-3" /> Gift message (optional)
                    </label>
                    <textarea
                      id="checkout-note"
                      value={giftMessage}
                      onChange={(e) => setGiftMessage(e.target.value)}
                      placeholder="Write something on the card..."
                      rows={2}
                      className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40"
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-3 text-xs font-semibold text-muted-foreground">
                    <div className="flex justify-between py-0.5"><span>Subtotal</span><span>Rs. {subtotal.toLocaleString()}</span></div>
                    <div className="flex justify-between py-0.5"><span>Delivery</span><span>Rs. {delivery.toLocaleString()}</span></div>
                    <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-sm font-black text-foreground">
                      <span>Total</span><span>Rs. {total.toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || phase === "submitting"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
                  >
                    {phase === "submitting" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Placing order...</>
                    ) : (
                      "Place order on Kapruka"
                    )}
                  </button>

                  <button
                    onClick={onOpenProductPages}
                    className="w-full text-center text-[11px] font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground cursor-pointer"
                  >
                    Or open each product page individually instead
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  {result?.status === "success" ? (
                    <>
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/10">
                        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-foreground">{result.message}</p>
                      {result.checkoutUrl && (
                        <a
                          href={result.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-xl bg-amber px-4 py-2 text-xs font-black text-amber-foreground hover:brightness-105"
                        >
                          Open checkout <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button onClick={onClose} className="mt-1 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer">
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-amber/10">
                        <AlertTriangle className="h-7 w-7 text-amber" />
                      </div>
                      <p className="text-sm font-bold text-foreground">{result?.message}</p>
                      <div className="flex gap-2">
                        <button onClick={() => setPhase("form")} className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground hover:bg-muted cursor-pointer">
                          Edit details
                        </button>
                        <button onClick={onOpenProductPages} className="rounded-xl bg-amber px-4 py-2 text-xs font-black text-amber-foreground hover:brightness-105 cursor-pointer">
                          Open product pages
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
