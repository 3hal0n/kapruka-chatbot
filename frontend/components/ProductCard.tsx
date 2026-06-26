"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Package } from "lucide-react";

export interface Product {
  id: string;
  name: string;
  price: number | { amount: number; currency: string } | string;
  image_url?: string;
  image?: string; // lovable compatibility
  availability?: string;
  in_stock?: boolean;
  stock_level?: string;
  stock?: string; // lovable compatibility
  category?: string;
  tag?: string; // lovable compatibility
  specs?: string;
  code?: string; // lovable compatibility
  summary?: string;
  match_percentage?: number;
  match?: number; // lovable compatibility
}

interface ProductCardProps {
  product: Product;
  onAdd: () => void;
  /** Current workspace mode — drives "Add to Box" variant in Gift Box Builder */
  mode?: string;
  /** Called with the product + button's DOMRect so the caller can launch the flying animation */
  onAddToBox?: (product: Product, rect: DOMRect) => void;
}

// Fallback high-res Unsplash images for various gift categories
const getProductImage = (prod: Product): string => {
  const url = prod.image_url || prod.image;
  if (url && url.startsWith("http")) {
    return url;
  }
  const name = prod.name.toLowerCase();
  if (name.includes("cake")) {
    return "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80";
  }
  if (name.includes("chocolate") || name.includes("choco")) {
    return "https://images.unsplash.com/photo-1549007994-cb92ca87df46?w=400&auto=format&fit=crop&q=80";
  }
  if (name.includes("flower") || name.includes("rose") || name.includes("bouquet")) {
    return "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400&auto=format&fit=crop&q=80";
  }
  if (name.includes("toy") || name.includes("teddy") || name.includes("bear")) {
    return "https://images.unsplash.com/photo-1559251606-c623743a6d76?w=400&auto=format&fit=crop&q=80";
  }
  return "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&auto=format&fit=crop&q=80";
};

export const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 22 },
  },
};

export function ProductCard({ product, onAdd, mode, onAddToBox }: ProductCardProps) {
  const addBoxBtnRef = useRef<HTMLButtonElement>(null);

  const rawPrice = product.price;
  const finalPrice = typeof rawPrice === "object" ? rawPrice.amount : Number(rawPrice);
  const tag = product.category || product.tag || "General";
  const code = product.id || product.code || "";
  const match =
    product.match_percentage !== undefined
      ? product.match_percentage
      : product.match !== undefined
      ? product.match
      : 90;
  const stock = product.stock_level
    ? `In stock (${product.stock_level})`
    : product.stock || "In stock (low)";
  const imageUrl = getProductImage(product);

  const cartBtnId = `add-to-cart-btn-${code.toLowerCase().replace(/_/g, "-")}`;
  const viewBtnId = `view-btn-${code.toLowerCase().replace(/_/g, "-")}`;

  const isBoxMode = mode === "Gift Box Builder";

  const handleAddToBox = () => {
    if (addBoxBtnRef.current && onAddToBox) {
      onAddToBox(product, addBoxBtnRef.current.getBoundingClientRect());
    }
  };

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow duration-300 hover:shadow-md"
    >
      {/* Product image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
        />
        {/* Gift Box mode badge overlay */}
        {isBoxMode && (
          <div className="absolute top-2 right-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow select-none">
            Box Mode
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-extrabold leading-snug tracking-tight line-clamp-2 min-h-10">
            {product.name}
          </h3>
          <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-[10px] font-bold text-primary select-none">
            {tag}
          </span>
        </div>

        <p className="truncate text-[11px] font-mono text-muted-foreground select-none">
          ID: <span className="text-foreground/80 select-all">{code}</span>
        </p>

        <p className="text-xs font-medium leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">{match}%</span> – Matched by Kapruka MCP live product search.
        </p>

        <div className="mt-1 flex items-center justify-between">
          <span className="text-base font-extrabold text-primary select-none">
            Rs. {finalPrice.toLocaleString()}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground select-none">
            {stock}
          </span>
        </div>

        <div className="mt-2 flex gap-2">
          {isBoxMode ? (
            <button
              ref={addBoxBtnRef}
              onClick={handleAddToBox}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-extrabold text-primary-foreground shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 active:scale-[0.97] cursor-pointer"
            >
              <Package className="h-3.5 w-3.5" />
              Add to Box
            </button>
          ) : (
            <button
              id={cartBtnId}
              onClick={onAdd}
              className="flex-1 rounded-xl bg-amber px-3 py-2 text-sm font-extrabold text-amber-foreground shadow-sm transition-all duration-300 ease-in-out hover:brightness-105 active:scale-[0.97] cursor-pointer"
            >
              Add to Cart
            </button>
          )}
          <a
            id={viewBtnId}
            href={`https://www.kapruka.com/buyonline/${product.name.toLowerCase().replace(/ /g, "-")}/kid/${code.toLowerCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold transition-all duration-300 ease-in-out hover:bg-muted flex items-center justify-center gap-1 text-foreground/80 hover:text-foreground"
          >
            View
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
