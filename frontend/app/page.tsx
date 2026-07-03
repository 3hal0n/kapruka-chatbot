"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Camera, PersonStanding } from "lucide-react";

import { RightCart, CartItem } from "@/components/RightCart";
import { GroupGiftModal } from "@/components/GroupGiftModal";
import { CheckoutModal, CheckoutDetails, CheckoutResult, CheckoutPrefill } from "@/components/CheckoutModal";
import { Product, kaprukaBuyUrl } from "@/components/ProductCard";
import { AnimatedAIChat, Message as ChatMessage } from "@/components/ui/animated-ai-chat";
import { AccessibilityLayer } from "@/components/AccessibilityLayer";
import { AuthPanel, RukiIdentity } from "@/components/auth/AuthPanel";
import { speakText, stopSpeech } from "@/lib/ruki-tts";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8000";

// Clerk is optional: without a publishable key the app runs in guest-only mode
// exactly as before (no provider, no hooks, no auth headers).
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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

  // ── Checkout (real order creation via /api/order)
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPrefill, setCheckoutPrefill] = useState<CheckoutPrefill | undefined>(undefined);
  const [checkoutAutoResult, setCheckoutAutoResult] = useState<CheckoutResult | undefined>(undefined);

  // ── Gift Box Builder
  const [giftBoxItems, setGiftBoxItems] = useState<CartItem[]>([]);
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);
  const giftBoxCanvasRef = useRef<HTMLDivElement>(null);

  // ── Input & Voice toggles
  const [language, setLanguage] = useState("English");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);

  // ── Accessibility (hands-free) Voice Assistant Mode
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const accessibilityOpenRef = useRef(false);
  useEffect(() => {
    accessibilityOpenRef.current = accessibilityOpen;
  }, [accessibilityOpen]);

  // ── Theme — pristine Light Mode by default, switches to Dark
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  const toggleTheme = () => setTheme(p => p === "light" ? "dark" : "light");

  // ── Session ID — guest id survives sign-out so anonymous chats resume cleanly
  const userIdRef = useRef<string>("");
  const guestIdRef = useRef<string>("");
  if (!guestIdRef.current) guestIdRef.current = generateUserId();
  if (!userIdRef.current) userIdRef.current = guestIdRef.current;

  // ── Clerk identity — resolved by <AuthPanel/>; guest fallback when disabled
  const identityRef = useRef<RukiIdentity | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);

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

  // ── Vision search upload
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Authenticated fetch headers — attaches the Clerk session JWT when present
  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const identity = identityRef.current;
    if (!identity?.userId) return {};
    const token = await identity.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // ── Identity resolution — switch the whole session to the clerk_id on sign-in
  const handleIdentity = useCallback((identity: RukiIdentity) => {
    identityRef.current = identity;
    if (identity.userId) {
      setIsSignedIn(true);
      userIdRef.current = identity.userId;
      setGuestLabel(identity.label || "Member");
      const stored = localStorage.getItem(`ruki_chat_messages_${identity.userId}`);
      setMessages(stored ? JSON.parse(stored) : []);
      // Hydrate the server-persisted cart (cross-device continuity).
      identity.getToken().then(token => {
        if (!token) return;
        fetch(`${BACKEND_URL}/api/me/cart`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            if (d?.items?.length) {
              setCart(prev => (prev.length === 0 ? d.items : prev));
            }
          })
          .catch(() => { /* cart service offline — local cart still works */ });
      });
    } else {
      setIsSignedIn(false);
      userIdRef.current = guestIdRef.current;
      syncGuestLabel();
      const stored = localStorage.getItem(`ruki_chat_messages_${guestIdRef.current}`);
      setMessages(stored ? JSON.parse(stored) : []);
    }
  }, []);

  // ── Persist the cart server-side for signed-in users (debounced)
  useEffect(() => {
    if (!isSignedIn) return;
    const t = setTimeout(async () => {
      const headers = await authHeaders();
      if (!headers.Authorization) return;
      fetch(`${BACKEND_URL}/api/me/cart`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image_url: i.image_url })),
        }),
      }).catch(() => { /* best-effort persistence */ });
    }, 900);
    return () => clearTimeout(t);
  }, [cart, isSignedIn, authHeaders]);

  // ── Speech Transcription Web Speech API (inline mic on the chat input)
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

  // ── Speech Output (TTS) — routed through the backend Cloud TTS voice
  // (female si-LK, Sinhala-capable) with automatic browser fallback.
  const speakResponse = (text: string) => {
    // In hands-free mode the AccessibilityLayer speaks every reply itself.
    if (accessibilityOpenRef.current) return;
    if (!isAudioActive) return;
    void speakText(text);
  };

  useEffect(() => {
    if (!isAudioActive && !accessibilityOpen) {
      stopSpeech();
    }
  }, [isAudioActive, accessibilityOpen]);

  // ── Cart operations
  // Pure merge so the SSE cart_update handler can compute a reliable snapshot
  // synchronously (React state updates are async/batched, so reading `cart`
  // right after calling setCart would see the stale pre-update value).
  const mergeProductIntoCart = (list: CartItem[], product: Product, quantity?: number): CartItem[] => {
    const price = typeof product.price === "object" ? (product.price as any).amount : Number(product.price);
    const id = product.id || (product as any).code || "";
    const qtyToAdd = quantity !== undefined ? quantity : (product as any).quantity || 1;
    const description = product.specs || product.category || product.summary || "";
    const hit = list.find(i => i.id === id);
    if (hit) return list.map(i => i.id === id ? { ...i, quantity: i.quantity + qtyToAdd } : i);
    return [...list, { id, name: product.name, price, image_url: product.image_url || product.image || "", quantity: qtyToAdd, url: kaprukaBuyUrl(product), description }];
  };

  const handleAddToCart = (product: Product, quantity?: number) => {
    setCart(prev => {
      const wasEmpty = prev.length === 0;
      const next = mergeProductIntoCart(prev, product, quantity);
      if (wasEmpty && next.length > 0) {
        fetch(`${BACKEND_URL}/api/delivery?city=Colombo`)
          .then(r => r.json()).then(d => { if (d.fee) setDeliveryFee(d.fee); }).catch(() => {});
      }
      return next;
    });
    if (window.innerWidth < 768) setRightOpen(true);
  };

  const updateQuantity = (id: string, delta: number) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));

  const handleRemoveFromCart = (id: string) =>
    setCart(prev => prev.filter(i => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const delivery = cart.length > 0 ? deliveryFee : 0;
  const total = subtotal + delivery;

  // Escape hatch: open each cart item's real Kapruka product page directly,
  // for when the user would rather complete checkout on Kapruka's own site.
  const handleOpenProductPages = () => {
    if (cart.length === 0) return;
    cart.forEach((item, idx) => {
      const url = item.url || `https://www.kapruka.com/buyonline/${item.name.toLowerCase().replace(/ /g, "-")}/kid/${item.id.toLowerCase()}`;
      setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), idx * 120);
    });
  };

  // Places a real order via the backend's kapruka_create_order MCP tool —
  // this is what actually adds the cart to Kapruka's system, unlike opening
  // product pages (which requires the user to manually re-add everything).
  // `cartOverride` lets the SSE handler pass a freshly-computed snapshot
  // instead of relying on the (possibly stale/batched) `cart` state.
  const submitOrder = async (details: CheckoutDetails, cartOverride?: CartItem[]): Promise<CheckoutResult> => {
    const orderCart = cartOverride ?? cart;
    const headers = await authHeaders();
    const res = await fetch(`${BACKEND_URL}/api/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        user_id: userIdRef.current,
        cart: orderCart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image_url: i.image_url })),
        recipient_name: details.recipientName,
        delivery_address: details.deliveryAddress,
        contact_number: details.contactNumber,
        city: details.city,
        gift_message: details.giftMessage,
      }),
    });
    const data = await res.json();
    if (data.status === "success") {
      setCart([]);
    }
    return {
      status: data.status === "success" ? "success" : data.status === "no_link" ? "no_link" : "error",
      checkoutUrl: data.checkout_url ?? null,
      orderId: data.order_id ?? null,
      message: data.message || "Order submitted.",
    };
  };

  // ── Clear history
  const handleClearHistory = async () => {
    try {
      const headers = await authHeaders();
      await fetch(`${BACKEND_URL}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ user_id: userIdRef.current }) });
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
      const headers = await authHeaders();
      const res = await fetch(`${BACKEND_URL}/api/group-gift/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
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

  // ── Persist a finished turn to local storage + state
  const commitMessages = (finalized: Message[]) => {
    setMessages(finalized);
    localStorage.setItem(`ruki_chat_messages_${userIdRef.current}`, JSON.stringify(finalized));
  };

  // ── Multimodal Computer Vision search — photo upload → catalog matches
  const handleImageSelected = async (file: File) => {
    if (!file) return;
    setIsTyping(true);
    setCurrentStatus("Analysing your photo…");

    const userMsg: Message = { id: `user-${Date.now()}`, sender: "user", text: `📷 Photo search: ${file.name}` };
    const updatedMessages = [...messages, userMsg];
    commitMessages(updatedMessages);

    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${BACKEND_URL}/api/vision/search`, {
        method: "POST",
        headers, // no Content-Type — the browser sets the multipart boundary
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().then((d) => d.detail).catch(() => null);
        throw new Error(detail || "Vision search failed");
      }
      const data = await res.json();
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: data.reply || "Here's what I matched from your photo:",
        intents: ["SEARCH"],
        products: data.products?.length ? data.products : undefined,
      };
      commitMessages([...updatedMessages, aiMsg]);
      speakResponse(aiMsg.text);
    } catch (err) {
      const text = err instanceof Error && err.message !== "Vision search failed"
        ? err.message
        : "Aiyo, I couldn't analyse that photo right now 😅 — please try again in a moment.";
      const errMsg: Message = { id: `ai-${Date.now()}`, sender: "ai", text, intents: ["SEARCH"], isError: true };
      commitMessages([...updatedMessages, errMsg]);
    } finally {
      setIsTyping(false);
      setCurrentStatus(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
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

    // Interrupt any reply still being read aloud when the user sends a new
    // message (the hands-free layer manages its own interruptions).
    if (!accessibilityOpenRef.current) {
      stopSpeech();
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
      const headers = await authHeaders();
      const resp = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
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
              const products: Product[] = p.products || [];
              let mergedCart = cart;
              products.forEach((prod) => {
                mergedCart = mergeProductIntoCart(mergedCart, prod);
              });
              if (products.length > 0) {
                const wasEmpty = cart.length === 0;
                setCart(mergedCart);
                if (wasEmpty) {
                  fetch(`${BACKEND_URL}/api/delivery?city=Colombo`)
                    .then(r => r.json()).then(d => { if (d.fee) setDeliveryFee(d.fee); }).catch(() => {});
                }
                if (window.innerWidth < 768) setRightOpen(true);
              }

              if (p.trigger_checkout && mergedCart.length > 0) {
                const details: CheckoutDetails = {
                  recipientName: p.recipient_name || "",
                  deliveryAddress: p.delivery_address || "",
                  contactNumber: p.contact_number || "",
                  city: "Colombo",
                  giftMessage: p.gift_message || undefined,
                };
                const hasAllRequired = details.recipientName && details.deliveryAddress && details.contactNumber;
                if (hasAllRequired) {
                  // Ruki already extracted everything needed conversationally —
                  // place the real order immediately instead of opening a form.
                  submitOrder(details, mergedCart).then((res) => {
                    setCheckoutAutoResult(res);
                    setCheckoutPrefill(undefined);
                    setCheckoutOpen(true);
                    if (res.status === "success" && res.checkoutUrl) {
                      window.open(res.checkoutUrl, "_blank", "noopener,noreferrer");
                    }
                  });
                } else {
                  // Missing a field (e.g. no phone number given) — open the
                  // form pre-filled with whatever was captured in chat.
                  setCheckoutAutoResult(undefined);
                  setCheckoutPrefill({
                    recipientName: details.recipientName || undefined,
                    deliveryAddress: details.deliveryAddress || undefined,
                    contactNumber: details.contactNumber || undefined,
                    giftMessage: details.giftMessage,
                  });
                  setCheckoutOpen(true);
                }
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

  const handleDeleteHistoryItem = (id: string) => {
    setChatHistory(prev => {
      const next = prev.filter(h => h.id !== id);
      localStorage.setItem("ruki_chat_history", JSON.stringify(next));
      return next;
    });
    localStorage.removeItem(`ruki_chat_messages_${id}`);
    // Deleting the chat currently open — drop into a fresh session so the
    // view doesn't keep showing messages whose storage was just removed.
    if (userIdRef.current === id) {
      handleStartNewChat();
    }
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

  // Latest finished assistant reply — spoken aloud by the AccessibilityLayer.
  const lastAiText = [...messages].reverse().find(m => m.sender === "ai")?.text || "";

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
                  onClick={() => {
                    // Gift Box items live in a separate staging area — merge them
                    // into the real cart so they're actually part of the order.
                    setCart(prev => {
                      let next = prev;
                      giftBoxItems.forEach(boxItem => {
                        const hit = next.find(i => i.id === boxItem.id);
                        next = hit
                          ? next.map(i => i.id === boxItem.id ? { ...i, quantity: i.quantity + boxItem.quantity } : i)
                          : [...next, { ...boxItem }];
                      });
                      return next;
                    });
                    setCheckoutAutoResult(undefined);
                    setCheckoutPrefill(undefined);
                    setCheckoutOpen(true);
                  }}
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
          sidebarOpen={leftOpen}
          onToggleSidebar={() => setLeftOpen(!leftOpen)}
          chatHistory={chatHistory}
          onSelectHistoryItem={handleSelectHistoryItem}
          onDeleteHistoryItem={handleDeleteHistoryItem}
          activeChatId={userIdRef.current}
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
          onAttachImage={() => imageInputRef.current?.click()}
          authSlot={CLERK_ENABLED ? (collapsed) => (
            <AuthPanel onIdentity={handleIdentity} collapsed={collapsed} theme={theme} onToggleTheme={toggleTheme} />
          ) : undefined}
        />

        {/* Floating multimodal controls: photo search + hands-free voice mode.
            Hidden while the voice panel is open — it docks in the same corner
            band and carries its own close control. */}
        {!accessibilityOpen && (
        <div className="pointer-events-none absolute bottom-28 right-4 z-40 flex flex-col gap-3">
          <button
            onClick={() => imageInputRef.current?.click()}
            aria-label="Search by photo — upload a product picture"
            title="Search by photo"
            className="pointer-events-auto grid h-12 w-12 cursor-pointer place-items-center rounded-full border border-border bg-surface text-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary hover:text-primary-foreground"
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setAccessibilityOpen(true)}
            aria-label="Open hands-free voice assistant mode"
            title="Hands-free voice mode"
            className="pointer-events-auto grid h-12 w-12 cursor-pointer place-items-center rounded-full border border-border bg-surface text-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary hover:text-primary-foreground"
          >
            <PersonStanding className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelected(file);
          }}
        />
      </div>

      <RightCart
        cart={cart}
        subtotal={subtotal}
        delivery={delivery}
        total={total}
        updateQuantity={updateQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={() => { setCheckoutAutoResult(undefined); setCheckoutPrefill(undefined); setCheckoutOpen(true); }}
        open={rightOpen}
        onClose={() => setRightOpen(false)}
        onGroupGift={handleGroupGift}
      />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        subtotal={subtotal}
        delivery={delivery}
        total={total}
        prefill={checkoutPrefill}
        autoResult={checkoutAutoResult}
        onSubmit={submitOrder}
        onOpenProductPages={handleOpenProductPages}
      />

      <GroupGiftModal
        open={isGroupGiftModalOpen}
        onClose={() => setIsGroupGiftModalOpen(false)}
        shareUrl={groupGiftLink}
        cart={cart}
        total={total}
      />

      {/* Hands-free / low-vision Voice Assistant Mode */}
      <AccessibilityLayer
        open={accessibilityOpen}
        onClose={() => setAccessibilityOpen(false)}
        onSubmit={handleSendMessage}
        isBusy={isTyping || !!streamedText}
        lastResponse={lastAiText}
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
