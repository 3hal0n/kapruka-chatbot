"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Gift } from "lucide-react";

import { RightCart, CartItem } from "@/components/RightCart";
import { GroupGiftModal } from "@/components/GroupGiftModal";
import { Product, kaprukaBuyUrl } from "@/components/ProductCard";
import { AnimatedAIChat, Message as ChatMessage } from "@/components/ui/animated-ai-chat";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";
const generateUserId = () => `ruki_${Math.random().toString(36).substring(2, 10)}`;

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  intents?: string[];
  products?: Product[];
  latency?: number;
  isError?: boolean;
}

interface FlyingItem {
  id: string;
  image: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export default function RukiPage() {
  // ── Navigation & Views
  const [mode, setMode] = useState<string>("Smart Shopping");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // ── Preferences (kept for compatibility with backend requests)
  const [budget, setBudget] = useState("");
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [vibeCheck, setVibeCheck] = useState("");

  // ── Group Gift
  const [isGroupGiftModalOpen, setIsGroupGiftModalOpen] = useState(false);
  const [groupGiftLink, setGroupGiftLink] = useState("");

  // ── Gift Box Builder
  const [giftBoxItems, setGiftBoxItems] = useState<CartItem[]>([]);
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const giftBoxCanvasRef = useRef<HTMLDivElement>(null);

  // ── Input & Voice toggles
  const [language, setLanguage] = useState("English");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);

  // ── Theme — pristine Light Mode by default, switches to Dark
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggleTheme = () => setTheme(p => p === "light" ? "dark" : "light");

  // ── Session ID
  const userIdRef = useRef<string>("");
  if (!userIdRef.current) userIdRef.current = generateUserId();

  // ── Guest label — derived client-side only after mount so the random
  // session id never diverges between the server and client render pass.
  const [guestLabel, setGuestLabel] = useState("Guest");
  const syncGuestLabel = () => setGuestLabel(`Guest #${userIdRef.current.slice(-4).toUpperCase()}`);

  // ── Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentIntents, setCurrentIntents] = useState<string[]>([]);
  const [streamedText, setStreamedText] = useState("");

  // ── Chat History Log
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; date: string }[]>([]);

  // ── Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(350);

  // ── Speech Transcription Web Speech API
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onresult = (event: any) => {
          const text = event.results[event.results.length - 1][0].transcript;
          if (text) {
            // Append transcribed text
            const chatInputEl = document.getElementById("chat-input-text") as HTMLTextAreaElement;
            if (chatInputEl) {
              const value = chatInputEl.value;
              chatInputEl.value = (value ? value + " " : "") + text.trim();
              const event = new Event('input', { bubbles: true });
              chatInputEl.dispatchEvent(event);
            }
          }
        };

        rec.onerror = () => setIsMicActive(false);
        rec.onend = () => setIsMicActive(false);
        recognitionRef.current = rec;
      }
    }
  }, []);

  const handleStartRecording = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (isMicActive) return;
    try {
      recognitionRef.current.start();
      setIsMicActive(true);
    } catch {
      // already active
    }
  };

  const handleStopRecording = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // not running
    }
    setIsMicActive(false);
  };

  // ── Load Chat History on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      syncGuestLabel();
      const storedHistory = localStorage.getItem("ruki_chat_history");
      if (storedHistory) {
        setChatHistory(JSON.parse(storedHistory));
      }
      
      // Load current messages — otherwise leave empty so the hero landing view shows
      const storedMessages = localStorage.getItem(`ruki_chat_messages_${userIdRef.current}`);
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
    }
  }, []);

  // ── Speech Output (TTS)
  const speakResponse = (text: string) => {
    if (!isAudioActive) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/<<.*?>>/g, "").trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!isAudioActive && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isAudioActive]);

  // ── Cart operations
  const handleAddToCart = (product: Product, quantity?: number) => {
    const price = typeof product.price === "object" ? (product.price as any).amount : Number(product.price);
    const id = product.id || (product as any).code || "";
    const qtyToAdd = quantity !== undefined ? quantity : (product as any).quantity || 1;
    setCart(prev => {
      const hit = prev.find(i => i.id === id);
      if (hit) return prev.map(i => i.id === id ? { ...i, quantity: i.quantity + qtyToAdd } : i);
      if (prev.length === 0) {
        fetch(`${BACKEND_URL}/api/delivery?city=Colombo`)
          .then(r => r.json()).then(d => { if (d.fee) setDeliveryFee(d.fee); }).catch(() => {});
      }
      return [...prev, { id, name: product.name, price, image_url: product.image_url || product.image || "", quantity: qtyToAdd, url: kaprukaBuyUrl(product) }];
    });
    if (window.innerWidth < 768) setRightOpen(true);
  };

  const updateQuantity = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const delivery = cart.length > 0 ? deliveryFee : 0;
  const total = subtotal + delivery;

  const handleCreateOrderLink = () => {
    if (cart.length === 0) return;
    cart.forEach((item, idx) => {
      const url = item.url || `https://www.kapruka.com/buyonline/${item.name.toLowerCase().replace(/ /g, "-")}/kid/${item.id.toLowerCase()}`;
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), idx * 120);
    });
  };

  // ── Clear history
  const handleClearHistory = async () => {
    try { 
      await fetch(`${BACKEND_URL}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userIdRef.current }) }); 
    } catch { /* offline */ }
    
    const newMsg: Message = { id: `clear-${Date.now()}`, sender: "ai", text: "History cleared. How can I help you find gifts today?" };
    setMessages([newMsg]);
    localStorage.setItem(`ruki_chat_messages_${userIdRef.current}`, JSON.stringify([newMsg]));
    setBudget(""); setRecipient(""); setOccasion(""); setCurrentIntents([]); setCurrentStatus(null);
  };

  // ── Gift Box Builder
  const handleAddToBox = (product: Product, sourceRect: DOMRect) => {
    const totalInBox = giftBoxItems.reduce((s, i) => s + i.quantity, 0);
    if (totalInBox >= 5) return;

    const boxRect = giftBoxCanvasRef.current?.getBoundingClientRect();
    const tx = boxRect ? boxRect.left + boxRect.width / 2 : window.innerWidth / 2;
    const ty = boxRect ? boxRect.top + boxRect.height / 2 : 80;

    const flyId = `fly-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const image = product.image_url || product.image || "";

    setFlyingItems(prev => [...prev, {
      id: flyId,
      image,
      sx: sourceRect.left + sourceRect.width / 2,
      sy: sourceRect.top + sourceRect.height / 2,
      tx,
      ty,
    }]);

    setTimeout(() => {
      setFlyingItems(prev => prev.filter(f => f.id !== flyId));
      setGiftBoxItems(prev => {
        if (prev.reduce((s, i) => s + i.quantity, 0) >= 5) return prev;
        const price = typeof product.price === "object" ? (product.price as any).amount : Number(product.price);
        const hit = prev.find(i => i.id === product.id);
        if (hit) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { id: product.id, name: product.name, price, image_url: product.image_url || product.image || "", quantity: 1 }];
      });
    }, 580);
  };

  const handleGroupGift = async () => {
    if (cart.length === 0) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/group-gift/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image_url: i.image_url })),
          subtotal,
          total,
          currency: "LKR",
        }),
      });
      const data = await res.json();
      const token = data.token || "preview";
      setGroupGiftLink(`${window.location.origin}/?group_gift=${token}`);
    } catch {
      setGroupGiftLink(`${window.location.origin}/?group_gift=preview`);
    }
    setIsGroupGiftModalOpen(true);
  };

  // ── Send message via SSE stream
  const handleSendMessage = async (userText: string) => {
    if (!userText.trim()) return;
    setIsTyping(true);
    // Leave status null so the playful rotating "Ruki is thinking…" indicator
    // shows; backend status events override it with specific progress text.
    setCurrentStatus(null);

    const userMsg: Message = { id: `user-${Date.now()}`, sender: "user", text: userText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    localStorage.setItem(`ruki_chat_messages_${userIdRef.current}`, JSON.stringify(updatedMessages));

    // Handle session history list update
    if (messages.length <= 1) {
      const title = userText.length > 25 ? userText.substring(0, 25) + "..." : userText;
      const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const newItem = { id: userIdRef.current, title, date };
      const updatedHistory = [newItem, ...chatHistory];
      setChatHistory(updatedHistory);
      localStorage.setItem("ruki_chat_history", JSON.stringify(updatedHistory));
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const ctx: Record<string, any> = {};
    ctx[recipient.toLowerCase() || "default"] = { budget: budget || undefined, occasion: occasion || undefined, location: "Colombo" };

    // Abort the request if the backend stalls (e.g. LLM upstream hangs) so the
    // user never sits on an endless "thinking" indicator — surface a friendly
    // error instead. Reset the timer each time a chunk arrives so long but
    // healthy streams aren't cut off.
    const controller = new AbortController();
    const STALL_MS = 45000;
    let stallTimer = setTimeout(() => controller.abort(), STALL_MS);
    const bumpStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(), STALL_MS);
    };

    try {
      const resp = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          user_id: userIdRef.current,
          message: userText,
          recipient_context: ctx,
          budget: budget || undefined,
          recipient: recipient || undefined,
          occasion: occasion || undefined,
          vibe_check: vibeCheck.trim() || undefined
        })
      });
      if (!resp.ok || !resp.body) throw new Error("SSE error");

      const reader = resp.body.getReader(); 
      const dec = new TextDecoder("utf-8");
      let buf = "", fullText = "", sseIntents: string[] = [], sseProducts: Product[] = [], sseLatency = 0, hasError = false;
      let isCartActionTurn = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bumpStall();
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); 
        buf = parts.pop() || "";
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
            if (ev === "intent_badge") {
              sseIntents = p.intents || [];
              setCurrentIntents(sseIntents);
              isCartActionTurn = sseIntents.includes("CART_ACTION") && !sseIntents.includes("SEARCH");
            }
            else if (ev === "status") {
              setCurrentStatus(p.message || "");
            }
            else if (ev === "text") { 
              setIsTyping(false); 
              fullText += p.text || ""; 
              setStreamedText(fullText); 
            }
            else if (ev === "product_carousel") {
              if (!isCartActionTurn && (p.type === "[PRODUCT_CAROUSEL_DATA]" || p.products)) {
                sseProducts = p.products || [];
              }
            }
            else if (ev === "cart_update") {
              const products = p.products || [];
              products.forEach((prod: Product) => {
                handleAddToCart(prod);
              });
              if (p.trigger_checkout) {
                setTimeout(() => { handleCreateOrderLink(); }, 400);
              }
              setCurrentStatus(null);
              setIsTyping(false);
            }
            else if (ev === "latency") sseLatency = p.latency || 0;
            else if (ev === "error") { hasError = true; }
          } catch { /* ignore */ }
        }
      }
      const aiText = fullText || (hasError ? "A stream error occurred while fetching catalog items." : "I searched Kapruka but couldn't find matching results.");
      const productsToAttach = isCartActionTurn ? undefined : (sseProducts.length > 0 ? sseProducts : undefined);
      
      const newAiMsg: Message = { id: `ai-${Date.now()}`, sender: "ai", text: aiText, intents: sseIntents, products: productsToAttach, latency: sseLatency, isError: hasError };
      const finalizedMessages = [...updatedMessages, newAiMsg];
      setMessages(finalizedMessages);
      localStorage.setItem(`ruki_chat_messages_${userIdRef.current}`, JSON.stringify(finalizedMessages));
      speakResponse(aiText);
    } catch (err) {
      const stalled = err instanceof DOMException && err.name === "AbortError";
      const isLogistics = /deliver|colombo|kandy/i.test(userText);
      const text = stalled
        ? "Aiyo, Ruki is taking too long to respond right now 😅 — the AI service may be busy or unavailable. Please try again in a moment."
        : isLogistics
        ? "Aney, yes! Kapruka delivers next-day. Standard shipping is LKR 350 to Colombo, Kandy, and surrounding districts."
        : "The backend is currently offline. Please ensure the FastAPI server is running and try again.";

      const offlineMsg: Message = { id: `sim-${Date.now()}`, sender: "ai", text, intents: isLogistics && !stalled ? ["LOGISTICS"] : ["SEARCH"], latency: 0, isError: true };
      const finalizedMessages = [...updatedMessages, offlineMsg];
      setMessages(finalizedMessages);
      localStorage.setItem(`ruki_chat_messages_${userIdRef.current}`, JSON.stringify(finalizedMessages));
      speakResponse(text);
    } finally {
      clearTimeout(stallTimer);
    }
    setStreamedText(""); setCurrentStatus(null); setCurrentIntents([]); setIsTyping(false);
  };

  const handleSelectHistoryItem = (id: string) => {
    userIdRef.current = id;
    syncGuestLabel();
    const stored = localStorage.getItem(`ruki_chat_messages_${id}`);
    if (stored) {
      setMessages(JSON.parse(stored));
    } else {
      setMessages([{ id: "initial-greeting", sender: "ai", text: "Welcome back! How can I help today?" }]);
    }
    setLeftOpen(false);
  };

  const handleStartNewChat = () => {
    userIdRef.current = generateUserId();
    syncGuestLabel();
    setMessages([]);
    setIsTyping(false);
    setCurrentStatus(null);
    setCurrentIntents([]);
    setStreamedText("");
    localStorage.removeItem(`ruki_chat_messages_${userIdRef.current}`);
  };

  // Convert Message array to ChatMessage format for AnimatedAIChat
  const chatMessages: ChatMessage[] = messages.map(m => ({
    id: m.id,
    role: m.sender === "user" ? "user" : "assistant",
    content: m.text,
    timestamp: new Date(),
    products: m.products,
    latency: m.latency,
    isError: m.isError,
    intents: m.intents
  }));

  // Append streamed text if present
  if (streamedText) {
    chatMessages.push({
      id: "streaming-text",
      role: "assistant",
      content: streamedText,
      timestamp: new Date()
    });
  }

  // If typing but not streaming text, show the animated "thinking" indicator.
  // Pass through a specific backend status if present; otherwise leave content
  // empty so the indicator cycles its playful phrases.
  if (isTyping && !streamedText) {
    chatMessages.push({
      id: "typing-indicator-msg",
      role: "assistant",
      content: currentStatus || "",
      timestamp: new Date(),
      intents: ["THINKING"]
    });
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground antialiased font-sans">
      {/* Gift Box Canvas for Gift Box Builder Mode */}
      <AnimatePresence>
        {mode === "Gift Box Builder" && (
          <motion.div
            ref={giftBoxCanvasRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="shrink-0 overflow-hidden border-b border-border bg-linear-to-r from-primary/5 to-amber/5 px-4 py-3 z-30"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-amber" />
                <span className="text-sm font-black tracking-tight text-foreground">Gift Box</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold select-none ${giftBoxItems.reduce((s, i) => s + i.quantity, 0) >= 5 ? "bg-amber text-amber-foreground" : "bg-primary/10 text-primary"}`}>
                  {giftBoxItems.reduce((s, i) => s + i.quantity, 0)}/5 items
                </span>
              </div>
              {giftBoxItems.length > 0 && (
                <button
                  onClick={() => setGiftBoxItems([])}
                  className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map(slot => {
                const item = giftBoxItems[slot];
                return (
                  <motion.div
                    key={slot}
                    animate={item ? { scale: [1.18, 1] } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 transition-all duration-300 ${
                      item
                        ? "border-primary/60 bg-surface shadow-sm"
                        : "border-dashed border-border bg-muted/20"
                    }`}
                  >
                    {item ? (
                      <>
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="h-full w-full rounded-[10px] object-cover"
                        />
                        {item.quantity > 1 && (
                          <span className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-black text-primary-foreground shadow">
                            {item.quantity}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-lg select-none opacity-30">🎁</span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {giftBoxItems.reduce((s, i) => s + i.quantity, 0) >= 5 && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-[11px] font-bold text-amber"
              >
                Box is full!{" "}
                <button
                  onClick={handleCreateOrderLink}
                  className="underline underline-offset-2 cursor-pointer hover:text-amber/80 transition-colors"
                >
                  Checkout now →
                </button>
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Conversation Layout */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatedAIChat
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isRecording={isMicActive}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          isAudioMuted={!isAudioActive}
          onToggleMute={() => setIsAudioActive(!isAudioActive)}
          sidebarOpen={leftOpen}
          onToggleSidebar={() => setLeftOpen(!leftOpen)}
          chatHistory={chatHistory}
          onSelectHistoryItem={handleSelectHistoryItem}
          onStartNewChat={handleStartNewChat}
          guestId={guestLabel}
          theme={theme}
          onToggleTheme={toggleTheme}
          onClearHistory={handleClearHistory}
          onToggleCart={() => setRightOpen(true)}
          cartCount={cart.reduce((s, i) => s + i.quantity, 0)}
          onAddToCart={handleAddToCart}
          onAddToBox={mode === "Gift Box Builder" ? handleAddToBox : undefined}
          activeMode={mode}
        />
      </div>

      <RightCart 
        cart={cart} 
        subtotal={subtotal} 
        delivery={delivery} 
        total={total} 
        updateQuantity={updateQuantity} 
        handleCreateOrderLink={handleCreateOrderLink} 
        open={rightOpen} 
        onClose={() => setRightOpen(false)} 
        onGroupGift={handleGroupGift} 
      />

      <GroupGiftModal 
        open={isGroupGiftModalOpen} 
        onClose={() => setIsGroupGiftModalOpen(false)} 
        shareUrl={groupGiftLink} 
        cart={cart} 
        total={total} 
      />

      {/* Flying thumbnail animations for Gift Box Builder */}
      {flyingItems.map(item => (
        <motion.img
          key={item.id}
          src={item.image}
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed z-80 h-10 w-10 rounded-xl object-cover shadow-xl border-2 border-amber"
          style={{ left: 0, top: 0 }}
          initial={{ x: item.sx - 20, y: item.sy - 20, scale: 1, opacity: 1 }}
          animate={{ x: item.tx - 20, y: item.ty - 20, scale: 0.35, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      ))}
    </div>
  );
}