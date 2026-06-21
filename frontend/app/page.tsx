"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, ShoppingCart, Sun, Moon } from "lucide-react";

import { LeftSidebar, Mode } from "@/components/LeftSidebar";
import { RightCart, CartItem } from "@/components/RightCart";
import { AssistantBubble } from "@/components/AssistantBubble";
import { UserBubble } from "@/components/UserBubble";
import { ShoppingContextCard } from "@/components/ShoppingContextCard";
import { ProductCard, Product } from "@/components/ProductCard";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { ChatInputCapsule } from "@/components/ChatInputCapsule";
import { OrderModal, CheckoutSuccessModal } from "@/components/OrderModals";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const generateUserId = () => `ruki_${Math.random().toString(36).substring(2, 10)}`;

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  intents?: string[];
  products?: Product[];
  latency?: number;
}

export default function RukiPage() {
  // ── Navigation
  const [mode, setMode] = useState<Mode>("Smart Shopping");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // ── Preferences
  const [budget, setBudget] = useState("");
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");

  // ── Input toggles
  const [language, setLanguage] = useState("English");
  const [messageInput, setMessageInput] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(true);

  // ── Theme
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggleTheme = () => setTheme(p => p === "light" ? "dark" : "light");

  // ── Session ID
  const userIdRef = useRef<string>("");
  if (!userIdRef.current) userIdRef.current = generateUserId();

  // ── Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentIntents, setCurrentIntents] = useState<string[]>([]);
  const [streamedText, setStreamedText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(350);

  // ── Order / checkout state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderRecipientName, setOrderRecipientName] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  // ── Greeting on language change
  useEffect(() => {
    const text = language === "සිංහල"
      ? "Hello! ආයුබෝවන්! මම Ruki AI. ඔබට අවශ්‍ය තෑගි තෝරා ගැනීමට මම ඔබට උදව් කරන්නම්. ඔබ සොයන්නේ කුමක්ද?"
      : "Hello! ආයුබෝවන්! I am Ruki AI, your personal Kapruka gifting companion...";
    setMessages([{ id: "initial-greeting", sender: "ai", text }]);
  }, [language]);

  // ── Autoscroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, isTyping, currentStatus]);

  // ── Cart
  const handleAddToCart = (product: Product) => {
    const price = typeof product.price === "object" ? (product.price as any).amount : Number(product.price);
    const id = product.id || (product as any).code || "";
    setCart(prev => {
      const hit = prev.find(i => i.id === id);
      if (hit) return prev.map(i => i.id === id ? { ...i, quantity: i.quantity + 1 } : i);
      if (prev.length === 0) {
        fetch(`${BACKEND_URL}/api/delivery?city=Colombo`)
          .then(r => r.json()).then(d => { if (d.fee) setDeliveryFee(d.fee); }).catch(() => {});
      }
      return [...prev, { id, name: product.name, price, image_url: product.image_url || product.image || "", quantity: 1 }];
    });
    if (window.innerWidth < 768) setRightOpen(true);
  };

  const updateQuantity = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const delivery = cart.length > 0 ? deliveryFee : 0;
  const total = subtotal + delivery;

  // ── Checkout
  const handleCreateOrderLink = () => { if (cart.length === 0) return; setOrderError(null); setIsOrderModalOpen(true); };

  const handleSubmitOrder = async () => {
    if (!orderRecipientName.trim() || !orderAddress.trim() || !orderPhone.trim()) {
      setOrderError("Please fill in all fields before placing the order."); return;
    }
    setIsOrderLoading(true); setOrderError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userIdRef.current, cart: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image_url: i.image_url })), recipient_name: orderRecipientName, delivery_address: orderAddress, contact_number: orderPhone }),
      });
      const data = await res.json();
      const url = data.checkout_url || `https://www.kapruka.com/checkout/guest?order_ref=${data.order_id}`;
      setCheckoutUrl(url); setIsOrderModalOpen(false); setIsCheckoutModalOpen(true);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch { setOrderError("Could not connect to the server. Please try again."); }
    finally { setIsOrderLoading(false); }
  };

  // ── Clear history
  const handleClearHistory = async () => {
    try { await fetch(`${BACKEND_URL}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userIdRef.current }) }); } catch { /* offline */ }
    setMessages([{ id: `clear-${Date.now()}`, sender: "ai", text: "History cleared. How can I help you find gifts today?" }]);
    setBudget(""); setRecipient(""); setOccasion(""); setCurrentIntents([]); setCurrentStatus(null);
  };

  // ── Send message via SSE
  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    const userText = messageInput;
    setMessageInput(""); setIsTyping(true); setCurrentStatus("Analyzing context...");
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, sender: "user", text: userText }]);

    const ctx: Record<string, any> = {};
    ctx[recipient.toLowerCase() || "default"] = { budget: budget || undefined, occasion: occasion || undefined, location: "Colombo" };

    try {
      const resp = await fetch(`${BACKEND_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userIdRef.current, message: userText, recipient_context: ctx, budget: budget || undefined, recipient: recipient || undefined, occasion: occasion || undefined }) });
      if (!resp.ok || !resp.body) throw new Error("SSE error");

      const reader = resp.body.getReader(); const dec = new TextDecoder("utf-8");
      let buf = "", fullText = "", sseIntents: string[] = [], sseProducts: Product[] = [], sseLatency = 0;

      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() || "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let ev = "", dv = "";
          for (const l of part.split("\n")) {
            if (l.startsWith("event:")) ev = l.slice(6).trim();
            else if (l.startsWith("data:")) dv = l.slice(5).trim();
          }
          if (!dv) continue;
          try {
            const p = JSON.parse(dv);
            if (ev === "intent_badge") { sseIntents = p.intents || []; setCurrentIntents(sseIntents); }
            else if (ev === "status") setCurrentStatus(p.message || "");
            else if (ev === "text") { setIsTyping(false); fullText += p.text || ""; setStreamedText(fullText); }
            else if (ev === "product_carousel") sseProducts = p.products || [];
            else if (ev === "latency") sseLatency = p.latency || 0;
          } catch { /* ignore */ }
        }
      }
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, sender: "ai", text: fullText || "I searched Kapruka but couldn't find matching results.", intents: sseIntents, products: sseProducts.length > 0 ? sseProducts : undefined, latency: sseLatency }]);
    } catch {
      // Offline fallback — no mock products shown
      const isLogistics = /deliver|colombo|kandy/i.test(userText);
      setMessages(prev => [...prev, { id: `sim-${Date.now()}`, sender: "ai", text: isLogistics ? "Aney, yes! Kapruka delivers next-day. Standard shipping is LKR 350 to Colombo, Kandy, and surrounding districts." : "The backend is currently offline. Please ensure the FastAPI server is running and try again.", intents: isLogistics ? ["LOGISTICS"] : ["SEARCH"], latency: 0 }]);
    }
    setStreamedText(""); setCurrentStatus(null); setCurrentIntents([]); setIsTyping(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground antialiased font-sans">

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md md:hidden">
        <button id="sidebar-toggle-btn-mobile" onClick={() => setLeftOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl text-foreground hover:bg-muted cursor-pointer" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base tracking-tight select-none">
          <span className="font-extrabold text-foreground">Kapruka</span> <span className="font-black" style={{ color: "#FFD700" }}>Ruki</span>
        </h1>
        <div className="flex items-center gap-1">
          <button id="theme-toggle-btn-mobile" onClick={toggleTheme} className="grid h-10 w-10 place-items-center rounded-xl text-foreground hover:bg-muted cursor-pointer" aria-label="Toggle theme">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button id="cart-toggle-btn-mobile" onClick={() => setRightOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-muted cursor-pointer" aria-label="Open cart">
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-amber text-[10px] font-bold text-amber-foreground animate-pulse">{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
          </button>
        </div>
      </header>

      <LeftSidebar mode={mode} setMode={setMode} budget={budget} setBudget={setBudget} recipient={recipient} setRecipient={setRecipient} occasion={occasion} setOccasion={setOccasion} open={leftOpen} onClose={() => setLeftOpen(false)} theme={theme} toggleTheme={toggleTheme} />

      {/* Center workspace */}
      <main className="flex flex-1 flex-col overflow-hidden pt-14 md:pt-0">
        <div className="flex flex-1 flex-col overflow-hidden p-3 md:p-6">
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-purple-950/50">

            <WorkspaceHeader mode={mode} language={language} setLanguage={setLanguage} theme={theme} toggleTheme={toggleTheme} onClearHistory={handleClearHistory} />

            {/* Chat thread */}
            <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-4 pb-28 pt-5 md:px-6 md:pb-32 md:pt-6">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className="space-y-4">
                  {msg.sender === "ai" ? <AssistantBubble intents={msg.intents} latency={msg.latency}>{msg.text}</AssistantBubble> : <UserBubble>{msg.text}</UserBubble>}
                  {msg.products && msg.products.length > 0 && (
                    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {msg.products.map(p => <ProductCard key={p.id} product={p} onAdd={() => handleAddToCart(p)} />)}
                    </motion.div>
                  )}
                </div>
              ))}

              {streamedText && <AssistantBubble>{streamedText}</AssistantBubble>}

              {messages.length <= 1 && !isTyping && (
                <ShoppingContextCard budget={budget} setBudget={setBudget} recipient={recipient} setRecipient={setRecipient} occasion={occasion} setOccasion={setOccasion} onContextUpdated={(type, val) => setMessages(prev => [...prev, { id: `sys-${Date.now()}`, sender: "ai", text: `Context updated: ${type.toUpperCase()} set to "${val}".` }])} theme={theme} />
              )}

              <AnimatePresence mode="wait">
                {(isTyping || currentStatus) && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="flex items-center gap-3 bg-muted border border-border px-4 py-2.5 rounded-full shadow-sm w-fit select-none">
                    <div className="flex space-x-1.5">
                      {[0, 150, 300].map(d => <span key={d} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </div>
                    {currentStatus && <span className="text-xs font-semibold text-muted-foreground">{currentStatus}</span>}
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={chatEndRef} />
            </div>

            <ChatInputCapsule messageInput={messageInput} setMessageInput={setMessageInput} isMicActive={isMicActive} setIsMicActive={setIsMicActive} isCameraActive={isCameraActive} setIsCameraActive={setIsCameraActive} isAudioActive={isAudioActive} setIsAudioActive={setIsAudioActive} onSend={handleSendMessage} />
          </div>
        </div>
      </main>

      <RightCart cart={cart} subtotal={subtotal} delivery={delivery} total={total} updateQuantity={updateQuantity} handleCreateOrderLink={handleCreateOrderLink} open={rightOpen} onClose={() => setRightOpen(false)} isOrderLoading={isOrderLoading} />

      {(leftOpen || rightOpen) && <div onClick={() => { setLeftOpen(false); setRightOpen(false); }} className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden" />}

      <OrderModal open={isOrderModalOpen} onClose={() => setIsOrderModalOpen(false)} cart={cart} total={total} recipientName={orderRecipientName} setRecipientName={setOrderRecipientName} address={orderAddress} setAddress={setOrderAddress} phone={orderPhone} setPhone={setOrderPhone} isLoading={isOrderLoading} error={orderError} onSubmit={handleSubmitOrder} />

      <CheckoutSuccessModal open={isCheckoutModalOpen} onClose={() => setIsCheckoutModalOpen(false)} checkoutUrl={checkoutUrl} />

    </div>
  );
}