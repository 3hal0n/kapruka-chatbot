"use client";

/**
 * /features — visual showcase of Ruki's capabilities.
 *
 * A responsive masonry grid (CSS columns, so mixed screenshot aspect ratios
 * pack tightly) mapping the captures in /public/snippets/ to short, engaging
 * capability cards. Paired screenshots (cart, checkout, theming) render as a
 * two-up inside one card. Styled entirely with the design tokens so it matches
 * the app aesthetic.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import { RukiLogo } from "@/components/ui/logo";

interface FeatureCard {
  title: string;
  description: string;
  images: string[]; // paths under /public
  wide?: boolean;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Voice-Activated Hands-Free Mode",
    description:
      "A full conversational loop with zero typing — Ruki listens, answers aloud in a warm female voice (native Sinhala included), and re-opens the mic the moment she finishes speaking.",
    images: ["/snippets/hands-free-mode.png"],
  },
  {
    title: "Smart Allergen Filtering",
    description:
      "Mention an allergy once and a zero-trust safety sweep purges every flagged product from results — before anything reaches the screen.",
    images: ["/snippets/allergy.png"],
  },
  {
    title: "Contextual Gift Recommendations",
    description:
      "Ruki reads the occasion, the recipient, and the budget — then recommends like a sharp local friend with opinions, not a search box.",
    images: ["/snippets/birthday-gift-response.png"],
  },
  {
    title: "Real-time Cart Sync",
    description:
      "Add, remove, or clear items in plain language — “add the first one”, “remove the roses” — and watch the cart update instantly, synced to your account across devices.",
    images: ["/snippets/cart.png", "/snippets/cart-management.png"],
  },
  {
    title: "Seamless Kapruka Checkout",
    description:
      "One tap carries your picks to Kapruka's real product pages to complete a secure checkout — no re-searching, no friction.",
    images: ["/snippets/checkout.png", "/snippets/checkout-kapruka.png"],
  },
  {
    title: "Side-by-Side Comparisons",
    description:
      "“Compare the first two” renders a clean grid of price, availability, and category — topped with Ruki's verdict on which one deserves your rupees.",
    images: ["/snippets/compare-items.png"],
  },
  {
    title: "Visual Photo Search",
    description:
      "Snap or upload a photo and Gemini extracts its semantic features — category, colour, texture, style — then matches it against Kapruka's live catalog.",
    images: ["/snippets/photo-search.png"],
  },
  {
    title: "Beautiful Theming",
    description:
      "A pristine light mode and a deep carbon dark mode, one toggle apart — every surface, chart, and chat bubble adapts.",
    images: ["/snippets/home-light-mode.png", "/snippets/home-dark-mode.png"],
  },
  {
    title: "Collaborative Group Gifting",
    description:
      "Split a gift with friends: Ruki mints a shareable link for the whole cart so everyone can chip in via WhatsApp or anywhere else.",
    images: ["/snippets/share-group-link.png"],
  },
  {
    title: "AI Greeting Card Generation",
    description:
      "Ask for “a sweet card for my amma in Sinhala” and Ruki composes a localized, heartfelt message — tone, relationship, and language all steerable in chat.",
    images: ["/snippets/write-sweet-card.png"],
  },
];

export default function FeaturesPage() {
  const [activeImage, setActiveImage] = useState<string | null>(null);

  // Close lightbox on Escape key
  useEffect(() => {
    if (!activeImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveImage(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImage]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <RukiLogo className="h-9 w-9" />
            <div>
              <h1 className="text-lg font-black tracking-tight">
                Ruki <span className="text-aurora">Features</span>
              </h1>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Everything your Kapruka shopping co-pilot can do
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full bg-linear-to-r from-primary-vivid to-primary-vivid-soft px-4 py-2 text-xs font-black text-primary-foreground shadow-md transition-all hover:brightness-105 active:scale-[0.97]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to chat
          </Link>
        </div>
      </header>

      {/* Intro */}
      <div className="mx-auto max-w-6xl px-5 pt-10 md:px-8">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary-vivid">
          <Sparkles className="h-3.5 w-3.5" />
          Capability showcase
        </p>
        <h2 className="mt-1 max-w-2xl text-2xl font-black tracking-tight md:text-3xl">
          Not a search box wearing a chat costume.
        </h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
          Real screenshots from the live app — every capability below works through plain
          conversation in English, native Sinhala, or Tanglish.
        </p>
      </div>

      {/* Masonry grid */}
      <main className="mx-auto max-w-6xl columns-1 gap-5 px-5 py-8 sm:columns-2 lg:columns-3 md:px-8">
        {FEATURE_CARDS.map((card, i) => (
          <motion.article
            key={card.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: (i % 3) * 0.06 }}
            className="group mb-5 break-inside-avoid overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-vivid/40 hover:shadow-lg"
          >
            {card.images.length === 1 ? (
              <img
                src={card.images[0]}
                alt={card.title}
                loading="lazy"
                onClick={() => setActiveImage(card.images[0])}
                className="w-full border-b border-border bg-muted object-cover transition-transform duration-500 group-hover:scale-[1.015] cursor-zoom-in"
              />
            ) : (
              <div className="grid grid-cols-2 gap-0.5 border-b border-border bg-border/40">
                {card.images.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt={card.title}
                    loading="lazy"
                    onClick={() => setActiveImage(src)}
                    className="h-full w-full bg-muted object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.015] cursor-zoom-in"
                  />
                ))}
              </div>
            )}
            <div className="p-4">
              <h3 className="text-sm font-black tracking-tight">{card.title}</h3>
              <p className="mt-1.5 text-xs font-medium leading-relaxed text-muted-foreground">
                {card.description}
              </p>
            </div>
          </motion.article>
        ))}
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-10 text-center md:px-8">
          <RukiLogo className="h-10 w-10" />
          <p className="text-sm font-bold">Ready to try it yourself?</p>
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-sm font-black shadow-sm transition-all hover:brightness-105 active:scale-[0.97]"
            style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
          >
            Start shopping with Ruki →
          </Link>
          <p className="text-[10px] font-medium text-muted-foreground/70">
            Ruki can make mistakes. Please verify important order details.
          </p>
        </div>
      </footer>
      {/* Image Lightbox Modal */}
      <AnimatePresence>
        {activeImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md cursor-zoom-out"
          >
            {/* Close Button */}
            <button
              onClick={() => setActiveImage(null)}
              className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white/70 transition-all hover:bg-white/20 hover:text-white active:scale-95 cursor-pointer"
              aria-label="Close image viewer"
            >
              <X className="h-6 w-6" />
            </button>
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()} // Prevent close when clicking image itself
              className="relative max-h-[85vh] max-w-[90vw] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
            >
              <img
                src={activeImage}
                alt="Enlarged view of Ruki feature screenshot"
                className="max-h-[85vh] max-w-[90vw] object-contain select-none"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
