"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Package, ShoppingCart } from "lucide-react";

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
  url?: string; // real Kapruka product-page URL (from MCP search)
  product_url?: string;
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

/**
 * Resolve a product's real Kapruka buy URL. Prefers the live `url`/`product_url`
 * from the MCP search; only constructs a fallback slug URL when neither exists.
 * Single source of truth shared by the product card and the cart checkout.
 */
export function kaprukaBuyUrl(product: Product): string {
  const code = product.id || product.code || "";
  return (
    product.url ||
    product.product_url ||
    `https://www.kapruka.com/buyonline/${product.name
      .toLowerCase()
      .replace(/ /g, "-")}/kid/${code.toLowerCase()}`
  );
}

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
  const isLowStock = /low|few|limited/i.test(stock);
  const imageUrl = getProductImage(product);

  const cartBtnId = `add-to-cart-btn-${code.toLowerCase().replace(/_/g, "-")}`;
  const viewBtnId = `view-btn-${code.toLowerCase().replace(/_/g, "-")}`;

  // Prefer a real Kapruka product URL from MCP; only construct a fallback when absent.
  const buyUrl = kaprukaBuyUrl(product);

  const isBoxMode = mode === "Gift Box Builder";

  const handleAddToBox = () => {
    if (addBoxBtnRef.current && onAddToBox) {
      onAddToBox(product, addBoxBtnRef.current.getBoundingClientRect());
    }
  };

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3 }}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-primary-glow/25 hover:border-primary/30"
    >
      {/* Product image — shallower 4:3 crop keeps the whole card compact */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Live inventory pill */}
        {!isBoxMode && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-bold text-foreground/80 shadow-sm backdrop-blur-sm select-none">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isLowStock ? "animate-pulse bg-amber" : "bg-emerald-500"}`}
            />
            {stock}
          </div>
        )}
        {/* Gift Box mode badge overlay */}
        {isBoxMode && (
          <div className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow select-none">
            Box Mode
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-[13px] font-bold leading-snug tracking-tight line-clamp-2 min-h-[34px]">
          {product.name}
        </h3>

        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[15px] font-extrabold text-primary select-none">
            Rs. {finalPrice.toLocaleString()}
          </span>
          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-bold text-primary select-none">
            {match}% match
          </span>
        </div>

        {/* Actions — stacked full-width so labels never wrap or clip */}
        <div className="mt-3 flex flex-col gap-1.5">
          {isBoxMode ? (
            <button
              ref={addBoxBtnRef}
              onClick={handleAddToBox}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 active:scale-[0.97] cursor-pointer"
            >
              <Package className="h-3.5 w-3.5" />
              Add to Box
            </button>
          ) : (
            <button
              id={cartBtnId}
              onClick={onAdd}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber px-3 py-2 text-xs font-extrabold text-amber-foreground shadow-sm transition-all duration-300 ease-in-out hover:brightness-105 active:scale-[0.97] cursor-pointer"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Add to Cart
            </button>
          )}
          <a
            id={viewBtnId}
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-all duration-300 ease-in-out hover:bg-muted hover:text-foreground"
          >
            Buy on Kapruka
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
