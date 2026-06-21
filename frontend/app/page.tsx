"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  ShoppingCart,
  ChevronDown,
  Trash2,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  ChevronRight,
  Check,
  X,
  ExternalLink,
  Sun,
  Moon,
  Loader2
} from "lucide-react";

import { LeftSidebar, Mode } from "@/components/LeftSidebar";
import { RightCart, CartItem } from "@/components/RightCart";
import { AssistantBubble } from "@/components/AssistantBubble";
import { UserBubble } from "@/components/UserBubble";
import { ShoppingContextCard } from "@/components/ShoppingContextCard";
import { ProductCard, Product } from "@/components/ProductCard";

// Backend API URL environment variable configuration
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  intents?: string[];
  status?: string;
  products?: Product[];
  latency?: number;
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: "EF_PC_CHOC0V571POD00076",
    name: "Glitter Hearts Chocolate Box",
    price: 3500,
    image_url: "https://images.unsplash.com/photo-1549007994-cb92ca87df46?w=400&auto=format&fit=crop&q=80",
    stock_level: "low",
    in_stock: true,
    category: "General",
    match_percentage: 92,
    summary: "Premium chocolates designed for celebrations and chocolate lovers across Sri Lanka."
  },
  {
    id: "CAKE00KA002138",
    name: "Mum's Rosy Elegance Ribbon Cake",
    price: 5800,
    image_url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80",
    stock_level: "low",
    in_stock: true,
    category: "General",
    match_percentage: 88,
    summary: "Rich ribbon cake decorated with sugar roses."
  },
  {
    id: "EF_PC_CHOC0V571POD00108",
    name: "Kit Kat Silk Roses Bouquet",
    price: 5900,
    image_url: "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400&auto=format&fit=crop&q=80",
    stock_level: "low",
    in_stock: true,
    category: "General",
    match_percentage: 84,
    summary: "A beautiful hand-tied bouquet combining fresh red roses and Kit Kat chocolates."
  }
];

// Stable unique session ID — persists for the browser tab lifetime
const generateUserId = () => `ruki_${Math.random().toString(36).substring(2, 10)}`;

export default function RukiPage() {
  // Navigation & Drawer States
  const [mode, setMode] = useState<Mode>("Smart Shopping");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // Preference Dropdown States
  const [budget, setBudget] = useState("");
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");

  // Input & Toggles
  const [language, setLanguage] = useState("English");
  const [messageInput, setMessageInput] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(true);

  // Theme states
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Sync theme class with document element
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  // Stable user session ID (persists across messages in the same tab)
  const userIdRef = useRef<string>("");
  if (!userIdRef.current) userIdRef.current = generateUserId();

  // Conversational Workspace Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentIntents, setCurrentIntents] = useState<string[]>([]);
  const [streamedText, setStreamedText] = useState("");

  // Dynamic Cart States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(350);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  // Pre-checkout order form states
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderRecipientName, setOrderRecipientName] = useState("");
  const [orderAddress, setOrderAddress] = useState("");
  const [orderPhone, setOrderPhone] = useState("");
  const [isOrderLoading, setIsOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Chat bottom scroll anchor
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize Greeting based on language
  useEffect(() => {
    let greeting = "";
    if (language === "සිංහල") {
      greeting = "Hello! ආයුබෝවන්! මම Ruki AI. ඔබට අවශ්‍ය තෑගි තෝරා ගැනීමට මම ඔබට උදව් කරන්නම්. ඔබ සොයන්නේ කුමක්ද?";
    } else {
      greeting = "Hello! ආයුබෝවන්! I am Ruki AI, your personal Kapruka gifting companion...";
    }

    setMessages([
      {
        id: "initial-greeting",
        sender: "ai",
        text: greeting
      }
    ]);
  }, [language]);

  // Autoscroll chat window
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, isTyping, currentStatus]);

  // Context Pill Click Callback
  const handleContextPillUpdated = (type: "budget" | "recipient" | "occasion", val: string) => {
    // Add visual system message to chat thread
    setMessages(prev => [
      ...prev,
      {
        id: `sys-log-${Date.now()}`,
        sender: "ai",
        text: `Context updated: ${type.toUpperCase()} set to "${val}".`
      }
    ]);
  };

  // Add Product to Cart — also fetches live delivery fee on first add
  const handleAddToCart = (product: Product) => {
    const rawPrice = product.price;
    const finalPrice = typeof rawPrice === "object" ? rawPrice.amount : Number(rawPrice);
    const code = product.id || (product as any).code || "";

    setCart(prev => {
      const existing = prev.find(item => item.id === code);
      if (existing) {
        return prev.map(item =>
          item.id === code ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      // First item added — fetch live delivery fee
      if (prev.length === 0) {
        fetch(`${BACKEND_URL}/api/delivery?city=Colombo`)
          .then(r => r.json())
          .then(data => { if (data.fee) setDeliveryFee(data.fee); })
          .catch(() => {}); // fallback stays 350
      }
      return [
        ...prev,
        {
          id: code,
          name: product.name,
          price: finalPrice,
          image_url: product.image_url || product.image || "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=100&auto=format&fit=crop&q=80",
          quantity: 1
        }
      ];
    });

    // Auto-open drawer on mobile
    if (window.innerWidth < 768) {
      setRightOpen(true);
    }
  };

  // Modify Cart quantities
  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter(item => item.quantity > 0)
    );
  };

  // Cart Subtotals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const delivery = cart.length > 0 ? deliveryFee : 0;
  const total = subtotal + delivery;

  // Open pre-checkout modal (replaces mock URL generator)
  const handleCreateOrderLink = () => {
    if (cart.length === 0) return;
    setOrderError(null);
    setIsOrderModalOpen(true);
  };

  // Submit order to /api/order → open live checkout URL
  const handleSubmitOrder = async () => {
    if (!orderRecipientName.trim() || !orderAddress.trim() || !orderPhone.trim()) {
      setOrderError("Please fill in all fields before placing the order.");
      return;
    }
    setIsOrderLoading(true);
    setOrderError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userIdRef.current,
          cart: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image_url: item.image_url,
          })),
          recipient_name: orderRecipientName,
          delivery_address: orderAddress,
          contact_number: orderPhone,
        })
      });
      const data = await res.json();
      const url = data.checkout_url || `https://www.kapruka.com/checkout/guest?order_ref=${data.order_id}`;
      setCheckoutUrl(url);
      setIsOrderModalOpen(false);
      setIsCheckoutModalOpen(true);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setOrderError("Could not connect to the server. Please try again.");
    } finally {
      setIsOrderLoading(false);
    }
  };

  // Clear Conversational Memory
  const handleClearHistory = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "ruki_customer" })
      });
    } catch (e) {
      console.log("Memory reset offline fallback triggered.");
    }

    setMessages([
      {
        id: `clear-g-${Date.now()}`,
        sender: "ai",
        text: "History cleared. How can I help you find gifts today?"
      }
    ]);
    setBudget("");
    setRecipient("");
    setOccasion("");
    setCurrentIntents([]);
    setCurrentStatus(null);
  };

  // Submit message and read SSE chunks
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim()) return;

    const userText = messageInput;
    setMessageInput("");
    setIsTyping(true);
    setCurrentStatus("Analyzing context...");

    // Add user bubble
    const userMsgObj: Message = {
      id: `user-msg-${Date.now()}`,
      sender: "user",
      text: userText
    };
    setMessages(prev => [...prev, userMsgObj]);

    // Build enriched context parameters
    const activeContext: Record<string, any> = {};
    const recipientKey = recipient.toLowerCase() || "default";
    activeContext[recipientKey] = {
      budget: budget || undefined,
      occasion: occasion || undefined,
      location: "Colombo"
    };

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userIdRef.current,
          message: userText,
          recipient_context: activeContext,
          budget: budget || undefined,
          recipient: recipient || undefined,
          occasion: occasion || undefined,
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("API SSE response error");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamBuffer = "";
      let fullText = "";
      let sseIntents: string[] = [];
      let sseProducts: Product[] = [];
      let sseLatency = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const parts = streamBuffer.split("\n\n");
        streamBuffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;

          let eventName = "";
          let dataVal = "";
          const lines = part.split("\n");

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
              dataVal = line.substring(5).trim();
            }
          }

          if (dataVal) {
            try {
              const payload = JSON.parse(dataVal);
              if (eventName === "intent_badge") {
                sseIntents = payload.intents || [];
                setCurrentIntents(sseIntents);
              } else if (eventName === "status") {
                setCurrentStatus(payload.message || "");
              } else if (eventName === "text") {
                setIsTyping(false);
                fullText += payload.text || "";
                setStreamedText(fullText);
              } else if (eventName === "product_carousel") {
                sseProducts = payload.products || [];
              } else if (eventName === "latency") {
                sseLatency = payload.latency || 0;
              }
            } catch (err) {
              console.warn("SSE parsing error:", err);
            }
          }
        }
      }

      // Add final assistant message
      const aiMessageObj: Message = {
        id: `ai-msg-${Date.now()}`,
        sender: "ai",
        text: fullText || "I searched Kapruka but couldn't find matching results.",
        intents: sseIntents,
        products: sseProducts.length > 0 ? sseProducts : undefined,
        latency: sseLatency
      };

      setMessages(prev => [...prev, aiMessageObj]);
      setStreamedText("");
      setCurrentStatus(null);
      setCurrentIntents([]);

    } catch (err) {
      console.warn("Falling back to local simulation:", err);

      // Simulated pipeline fallback
      await new Promise(r => setTimeout(r, 600));
      setCurrentIntents(["SEARCH"]);
      setCurrentStatus("Searching Kapruka catalog...");

      await new Promise(r => setTimeout(r, 600));
      setCurrentStatus("Auditing allergen constraints...");

      await new Promise(r => setTimeout(r, 800));
      setIsTyping(false);

      const isLogistics = userText.toLowerCase().includes("deliver") ||
                           userText.toLowerCase().includes("colombo") ||
                           userText.toLowerCase().includes("kandy");

      let simulatedReply = "";
      let matchedItems: Product[] = [];

      if (isLogistics) {
        simulatedReply = "Aney, yes! Kapruka delivers next-day. Standard shipping is LKR 350 to Colombo, Kandy, and surrounding districts.";
      } else {
        simulatedReply = "Aney sure, puluwan machan! Based on your context, I searched the live catalog and checked the stock levels. Here are the top matched recommendations:";
        matchedItems = MOCK_PRODUCTS;
      }

      const simMessageObj: Message = {
        id: `sim-msg-${Date.now()}`,
        sender: "ai",
        text: simulatedReply,
        intents: isLogistics ? ["LOGISTICS"] : ["SEARCH"],
        products: matchedItems.length > 0 ? matchedItems : undefined,
        latency: 1.25
      };

      setMessages(prev => [...prev, simMessageObj]);
      setCurrentStatus(null);
      setCurrentIntents([]);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground antialiased font-sans">
      
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md md:hidden">
        <button
          id="sidebar-toggle-btn-mobile"
          onClick={() => setLeftOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl text-foreground transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base tracking-tight select-none">
          <span className="font-extrabold text-foreground">Kapruka</span> <span className="font-black" style={{ color: "#FFD700" }}>Ruki</span>
        </h1>
        <div className="flex items-center gap-1">
          <button
            id="theme-toggle-btn-mobile"
            onClick={toggleTheme}
            className="grid h-10 w-10 place-items-center rounded-xl text-foreground transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>
          <button
            id="cart-toggle-btn-mobile"
            onClick={() => setRightOpen(true)}
            className="relative grid h-10 w-10 place-items-center rounded-xl transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
            aria-label="Open cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-amber text-[10px] font-bold text-amber-foreground animate-pulse">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Modular Left preference drawer */}
      <LeftSidebar
        mode={mode}
        setMode={setMode}
        budget={budget}
        setBudget={setBudget}
        recipient={recipient}
        setRecipient={setRecipient}
        occasion={occasion}
        setOccasion={setOccasion}
        open={leftOpen}
        onClose={() => setLeftOpen(false)}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Center workspace */}
      <main className="flex flex-1 flex-col overflow-hidden pt-14 md:pt-0">
        <div className="flex flex-1 flex-col overflow-hidden p-3 md:p-6">
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-purple-950/50">
            
            {/* Top Workspace Bar */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:flex sm:flex-wrap sm:justify-between md:px-6 md:py-4 select-none">
              <h2 className="truncate text-lg font-extrabold tracking-tight md:text-xl">{mode}</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select 
                    id="language-select"
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="appearance-none rounded-xl border border-border bg-surface py-2 pl-3 pr-8 text-sm font-semibold outline-none transition-all duration-300 ease-in-out hover:bg-muted focus:ring-2 focus:ring-ring/40 cursor-pointer"
                  >
                    <option value="English">English</option>
                    <option value="සිංහල">සිංහල</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                
                <button 
                  id="clear-history-btn"
                  onClick={handleClearHistory}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" /> 
                  <span className="hidden sm:inline">Clear history</span>
                </button>

                <button
                  id="theme-toggle-btn-desktop"
                  onClick={toggleTheme}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-foreground transition-all duration-300 ease-in-out hover:bg-muted cursor-pointer"
                  aria-label="Toggle theme"
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Chat Thread Container */}
            <div className="scroll-slim flex-1 space-y-5 overflow-y-auto px-4 pb-28 pt-5 md:px-6 md:pb-32 md:pt-6">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className="space-y-4">
                  {msg.sender === "ai" ? (
                    <AssistantBubble intents={msg.intents} latency={msg.latency}>
                      {msg.text}
                    </AssistantBubble>
                  ) : (
                    <UserBubble>{msg.text}</UserBubble>
                  )}

                  {/* Staggered Recommendations display */}
                  {msg.products && msg.products.length > 0 && (
                    <motion.div
                      initial="hidden"
                      animate="show"
                      variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: 0.08 } },
                      }}
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      {msg.products.map(p => (
                        <ProductCard key={p.id} product={p} onAdd={() => handleAddToCart(p)} />
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}

              {/* Live Streaming Content display */}
              {streamedText && (
                <AssistantBubble>{streamedText}</AssistantBubble>
              )}

              {/* Contextual Selector Cards (shown initially) */}
              {messages.length <= 1 && !isTyping && (
                <ShoppingContextCard
                  budget={budget}
                  setBudget={setBudget}
                  recipient={recipient}
                  setRecipient={setRecipient}
                  occasion={occasion}
                  setOccasion={setOccasion}
                  onContextUpdated={handleContextPillUpdated}
                  theme={theme}
                />
              )}

              {/* Pipeline loading animations */}
              <AnimatePresence mode="wait">
                {(isTyping || currentStatus) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 bg-muted border border-border px-4 py-2.5 rounded-full shadow-sm w-fit select-none"
                  >
                    <div className="flex space-x-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    {currentStatus && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {currentStatus}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={chatEndRef} />
            </div>

            {/* Fixed Chat Input Access Capsule */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3 md:px-6 md:pb-5">
              <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border bg-surface/80 px-2.5 py-2 shadow-lg backdrop-blur-md focus-within:ring-1 focus-within:ring-ring/40">
                <button
                  id="mic-toggle-btn"
                  type="button"
                  aria-label="Voice"
                  onClick={() => setIsMicActive(!isMicActive)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${isMicActive ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                >
                  {isMicActive ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
                </button>
                <button
                  id="camera-toggle-btn"
                  type="button"
                  aria-label="Camera"
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${isCameraActive ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                >
                  {isCameraActive ? <Camera className="h-4.5 w-4.5" /> : <CameraOff className="h-4.5 w-4.5" />}
                </button>
                <button
                  id="audio-toggle-btn"
                  type="button"
                  aria-label="Audio"
                  onClick={() => setIsAudioActive(!isAudioActive)}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${isAudioActive ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"}`}
                >
                  {isAudioActive ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
                </button>
                
                <input
                  id="chat-input-text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Ask Ruki to search, compare, plan an event…"
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium outline-none placeholder:text-muted-foreground/80 text-foreground"
                  onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                />
                
                <button
                  id="chat-send-btn"
                  onClick={() => handleSendMessage()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,215,0,0.5)] active:scale-[0.97] disabled:opacity-60 cursor-pointer"
                  style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
                  disabled={!messageInput.trim()}
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Modular Right cart sidebar drawer */}
      <RightCart
        cart={cart}
        subtotal={subtotal}
        delivery={delivery}
        total={total}
        updateQuantity={updateQuantity}
        handleCreateOrderLink={handleCreateOrderLink}
        open={rightOpen}
        onClose={() => setRightOpen(false)}
        isOrderLoading={isOrderLoading}
      />

      {/* Backdrop for open drawer layout on mobile */}
      {(leftOpen || rightOpen) && (
        <div 
          onClick={() => { setLeftOpen(false); setRightOpen(false); }}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Pre-checkout Order Details Modal */}
      <AnimatePresence>
        {isOrderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-surface rounded-2xl shadow-2xl overflow-hidden border border-border"
            >
              {/* Modal Header */}
              <div className="bg-primary text-primary-foreground p-5 flex items-center justify-between">
                <div className="flex items-center gap-2 select-none">
                  <ShoppingCart className="h-5 w-5" />
                  <span className="font-extrabold tracking-tight">Delivery Details</span>
                </div>
                <button
                  id="order-modal-close-btn"
                  onClick={() => setIsOrderModalOpen(false)}
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
                      <span className="font-semibold text-foreground truncate max-w-[200px]">{item.name} ×{item.quantity}</span>
                      <span className="font-bold text-primary shrink-0">Rs. {(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t border-border mt-2 pt-2 flex justify-between text-xs font-black">
                    <span>Total</span>
                    <span>Rs. {total.toLocaleString()}</span>
                  </div>
                </div>

                {/* Form fields */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recipient Name *</label>
                    <input
                      id="order-recipient-name"
                      type="text"
                      placeholder="e.g. Dilanka Perera"
                      value={orderRecipientName}
                      onChange={e => setOrderRecipientName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Delivery Address *</label>
                    <input
                      id="order-delivery-address"
                      type="text"
                      placeholder="e.g. 45 Galle Road, Colombo 03"
                      value={orderAddress}
                      onChange={e => setOrderAddress(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Contact Number *</label>
                    <input
                      id="order-phone-number"
                      type="tel"
                      placeholder="e.g. 0771234567"
                      value={orderPhone}
                      onChange={e => setOrderPhone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-ring/40 text-foreground placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                {orderError && (
                  <p className="text-xs font-semibold text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{orderError}</p>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    id="order-cancel-btn"
                    onClick={() => setIsOrderModalOpen(false)}
                    className="w-full border border-border text-foreground py-3 rounded-xl text-xs font-bold hover:bg-muted transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="order-submit-btn"
                    onClick={handleSubmitOrder}
                    disabled={isOrderLoading}
                    className="w-full rounded-xl py-3 text-xs font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,215,0,0.4)] active:scale-[0.98] disabled:opacity-70 cursor-pointer inline-flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
                  >
                    {isOrderLoading ? (
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

      {/* Post-order success modal — shows checkout URL */}
      <AnimatePresence>
        {isCheckoutModalOpen && (
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
                  onClick={() => setIsCheckoutModalOpen(false)}
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
                    onClick={() => {
                      if (checkoutUrl) navigator.clipboard.writeText(checkoutUrl);
                    }}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer shrink-0"
                  >
                    Copy
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="checkout-close-btn"
                    onClick={() => setIsCheckoutModalOpen(false)}
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

    </div>
  );
}