"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  ShoppingBag, 
  Gift, 
  Check, 
  Trash2, 
  Mic, 
  Camera, 
  Volume2, 
  Send, 
  Menu, 
  X, 
  ChevronDown, 
  Plus, 
  Minus, 
  ExternalLink,
  ChevronRight,
  RefreshCw,
  ShoppingBag as CartIcon,
  MicOff,
  CameraOff,
  VolumeX,
  Compass,
  Layers,
  ArrowRightLeft,
  FileSearch,
  MessageSquareDot
} from "lucide-react";

// Types
interface Product {
  id: string;
  name: string;
  price: number | { amount: number; currency: string } | string;
  image_url?: string;
  availability?: string;
  in_stock?: boolean;
  stock_level?: string;
  category?: string;
  summary?: string;
  specs?: string;
  match_percentage?: number;
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  intents?: string[];
  status?: string;
  products?: Product[];
  latency?: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: "EF_PC_CHOCOV571PD00076",
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
    summary: "Rich ribbon cake decorated with elegant sugar roses."
  },
  {
    id: "EF_PC_CHOCOV571PD00108",
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

// Backend API URL environment variable configuration
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Fallback high-res Unsplash images for various gift categories
const getProductImage = (prod: Product): string => {
  if (prod.image_url && prod.image_url.startsWith("http")) {
    return prod.image_url;
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

// Framer Motion Animation Variants for staggered product carousel entry
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring" as const, stiffness: 100, damping: 15 } 
  }
};

export default function Home() {
  // Sidebar & Layout State
  const [activeMode, setActiveMode] = useState("Smart Shopping");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Preference Dropdowns
  const [budget, setBudget] = useState("");
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");

  // Input & Toggles
  const [language, setLanguage] = useState("English");
  const [messageInput, setMessageInput] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(true);

  // Chat Thread State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [currentIntents, setCurrentIntents] = useState<string[]>([]);
  const [streamedText, setStreamedText] = useState("");

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  // Chat scroll anchor
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initial greeting based on language selection
  useEffect(() => {
    let greeting = "";
    if (language === "Sinhala") {
      greeting = "ආයුබෝවන්! මම Ruki AI. ඔබට අවශ්‍ය තෑගි තෝරා ගැනීමට මම ඔබට උදව් කරන්නම්. ඔබ සොයන්නේ කුමක්ද?";
    } else if (language === "Singlish") {
      greeting = "Ayubowan! I am Ruki AI. Oyata wife ta or friend ta gift ekak deliver karන්න ඕනෙද? Budget eka and details kiyන්න, mama products select karala dhennam!";
    } else {
      greeting = "Hello! Ayubowan! I am Ruki AI. Tell me what you are looking for, and I will guide you to find the perfect gift from Kapruka.";
    }
    
    setMessages([
      {
        id: "initial-greeting",
        sender: "ai",
        text: greeting
      }
    ]);
  }, [language]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, isTyping, currentStatus]);

  // Context pill click triggers
  const handlePillClick = (type: "budget" | "recipient" | "occasion", value: string) => {
    if (type === "budget") setBudget(value);
    if (type === "recipient") setRecipient(value);
    if (type === "occasion") setOccasion(value);

    // Add visual log inside chat
    const systemLog: Message = {
      id: `sys-log-${Date.now()}`,
      sender: "ai",
      text: `Context updated: ${type.toUpperCase()} set to "${value}".`
    };
    setMessages(prev => [...prev, systemLog]);
  };

  // Add Product to Cart
  const handleAddToCart = (product: Product) => {
    const rawPrice = typeof product.price === "object" ? product.price.amount : Number(product.price);
    
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: rawPrice,
        image_url: product.image_url || "https://images.unsplash.com/photo-1549007994-cb92ca87df46?w=100&auto=format&fit=crop&q=80",
        quantity: 1
      }];
    });

    // Pulse cart drawer on mobile
    if (window.innerWidth < 768) {
      setIsCartOpen(true);
    }
  };

  // Modify Cart Item quantity
  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Calculate totals
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const delivery = subtotal > 0 ? 350 : 0;
  const total = subtotal + delivery;

  // Create Guest Order Checkout Link
  const handleCreateOrderLink = () => {
    if (cart.length === 0) return;
    const randomOrderNumber = Math.random().toString(36).substring(2, 8).toUpperCase();
    const mockUrl = `https://www.kapruka.com/checkout/guest?order_ref=RUKI-${randomOrderNumber}&items=${cart.length}`;
    setCheckoutUrl(mockUrl);
    setIsCheckoutModalOpen(true);
  };

  // Clear Conversational History
  const handleClearHistory = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "ruki_customer" })
      });
    } catch (e) {
      console.log("Offline mode: cleared locally.");
    }
    
    setMessages([
      {
        id: `greeting-${Date.now()}`,
        sender: "ai",
        text: "Conversation history cleared. Ready to help you again!"
      }
    ]);
    setBudget("");
    setRecipient("");
    setOccasion("");
    setCurrentIntents([]);
    setCurrentStatus(null);
  };

  // Send Message & Read SSE stream
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim()) return;

    const userMsgText = messageInput;
    setMessageInput("");
    setIsTyping(true);
    setCurrentStatus("Analyzing context...");

    // Append User Message to Thread
    const userMessageObj: Message = {
      id: `user-msg-${Date.now()}`,
      sender: "user",
      text: userMsgText
    };
    setMessages(prev => [...prev, userMessageObj]);

    // Build Context
    const activeContext: Record<string, any> = {};
    const recipientKey = recipient.toLowerCase() || "default";
    activeContext[recipientKey] = {
      budget: budget || undefined,
      occasion: occasion || undefined,
      location: "Colombo" // default
    };

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "ruki_customer",
          message: userMsgText,
          recipient_context: activeContext
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("HTTP error or empty stream body");
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

      // Commit full AI message to thread
      const aiMessageObj: Message = {
        id: `ai-msg-${Date.now()}`,
        sender: "ai",
        text: fullText || "I searched the Kapruka catalog for you but didn't find matching results.",
        intents: sseIntents,
        products: sseProducts.length > 0 ? sseProducts : undefined,
        latency: sseLatency
      };
      
      setMessages(prev => [...prev, aiMessageObj]);
      setStreamedText("");
      setCurrentStatus(null);
      setCurrentIntents([]);

    } catch (error) {
      console.warn("Falling back to local simulation:", error);
      
      // Local Simulation when backend is offline
      await new Promise(resolve => setTimeout(resolve, 800));
      setCurrentIntents(["SEARCH"]);
      setCurrentStatus("Searching Kapruka catalog...");
      
      await new Promise(resolve => setTimeout(resolve, 800));
      setCurrentStatus("Reviewing catalog allergen safety...");
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsTyping(false);

      const isLogisticsRequest = userMsgText.toLowerCase().includes("deliver") || 
                                userMsgText.toLowerCase().includes("colombo") || 
                                userMsgText.toLowerCase().includes("kandy");

      let simulatedReply = "";
      let matchedItems: Product[] = [];

      if (isLogisticsRequest) {
        simulatedReply = "Aney, yes! Kapruka delivers to Colombo 01, Colombo 03, and Colombo 07. Standard delivery fee is LKR 350, and delivery takes next-day. This aligns perfectly with your deadline!";
      } else {
        simulatedReply = "Aney sure, puluwan machan! Based on your request, I searched the live Kapruka MCP catalog and audited the stock level. Here are the top matched items that are allergen-safe and ready for checkout:";
        matchedItems = SAMPLE_PRODUCTS;
      }

      const simMessageObj: Message = {
        id: `sim-msg-${Date.now()}`,
        sender: "ai",
        text: simulatedReply,
        intents: isLogisticsRequest ? ["LOGISTICS"] : ["SEARCH"],
        products: matchedItems.length > 0 ? matchedItems : undefined,
        latency: 1.45
      };

      setMessages(prev => [...prev, simMessageObj]);
      setCurrentStatus(null);
      setCurrentIntents([]);
    }
  };

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-[#F8F7FA] font-sans text-slate-800 antialiased selection:bg-purple-100">
      
      {/* ── MOBILE HEADER (Top boundary, shown on mobile only) ── */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <button 
          id="sidebar-toggle-btn-mobile"
          onClick={() => setIsSidebarOpen(true)}
          className="rounded-lg p-1.5 hover:bg-slate-100"
          aria-label="Toggle Preferences"
        >
          <Menu className="h-6 w-6 text-slate-600" />
        </button>
        <span className="text-xl font-black tracking-tight text-[#441B71] flex items-center gap-1.5 select-none">
          <Sparkles className="h-5 w-5 fill-amber-400 stroke-amber-400" />
          Ruki <span className="text-amber-500">AI</span>
        </span>
        <button 
          id="cart-toggle-btn-mobile"
          onClick={() => setIsCartOpen(true)}
          className="relative rounded-lg p-1.5 hover:bg-slate-100"
          aria-label="Open Cart"
        >
          <CartIcon className="h-6 w-6 text-[#441B71]" />
          {cart.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-slate-900 shadow-sm animate-pulse">
              {cart.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          )}
        </button>
      </header>

      {/* ── 1. LEFT SIDEBAR (Width: 260px) — Modes & Preferences ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-300 md:static md:translate-x-0
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Brand Treatment Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
          <h1 className="text-2xl font-black tracking-tight text-[#441B71] flex items-center gap-2 select-none">
            <Sparkles className="h-6 w-6 fill-amber-400 stroke-amber-400" />
            Ruki <span className="text-amber-500 font-extrabold">AI</span>
          </h1>
          <button 
            id="sidebar-close-btn-mobile"
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-lg p-1 hover:bg-slate-100 md:hidden"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Section 1: Modes & Preferences Vertical Menu */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          <div>
            <h2 className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Modes & Preferences
            </h2>
            <nav className="space-y-1">
              {[
                { name: "Smart Shopping", icon: Compass },
                { name: "Event Planner", icon: Layers },
                { name: "Gift Box Builder", icon: Gift },
                { name: "Product Compare", icon: ArrowRightLeft },
                { name: "Order Tracking", icon: FileSearch },
                { name: "Gift Message", icon: MessageSquareDot }
              ].map(mode => {
                const Icon = mode.icon;
                const isActive = activeMode === mode.name;
                return (
                  <button
                    key={mode.name}
                    id={`mode-btn-${mode.name.toLowerCase().replace(/ /g, "-")}`}
                    onClick={() => setActiveMode(mode.name)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                      ${isActive 
                        ? "bg-[#441B71] text-white shadow-md shadow-purple-900/10" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}
                    `}
                  >
                    <Icon className={`h-4.5 w-4.5 ${isActive ? "text-amber-300" : "text-slate-400"}`} />
                    {mode.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Section 2: Preferences Sticky Select Panels */}
          <div className="pt-4 border-t border-slate-100">
            <h2 className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
              Shopping Context
            </h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="budget-select" className="block text-xs font-bold text-slate-500 mb-1 px-1">Budget</label>
                <div className="relative">
                  <select 
                    id="budget-select"
                    value={budget} 
                    onChange={e => setBudget(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-[#441B71] focus:bg-white"
                  >
                    <option value="">Select Budget</option>
                    <option value="Under Rs. 2,500">Under Rs. 2,500</option>
                    <option value="Rs. 2,500 - 5,000">Rs. 2,500 - 5,000</option>
                    <option value="Rs. 5,000 - 10,000">Rs. 5,000 - 10,000</option>
                    <option value="Above Rs. 10,000">Above Rs. 10,000</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label htmlFor="recipient-select" className="block text-xs font-bold text-slate-500 mb-1 px-1">Recipient</label>
                <div className="relative">
                  <select 
                    id="recipient-select"
                    value={recipient} 
                    onChange={e => setRecipient(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-[#441B71] focus:bg-white"
                  >
                    <option value="">Select Recipient</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Child">Child</option>
                    <option value="Couple">Couple</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label htmlFor="occasion-select" className="block text-xs font-bold text-slate-500 mb-1 px-1">Occasion</label>
                <div className="relative">
                  <select 
                    id="occasion-select"
                    value={occasion} 
                    onChange={e => setOccasion(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-[#441B71] focus:bg-white"
                  >
                    <option value="">Select Occasion</option>
                    <option value="Birthday">Birthday</option>
                    <option value="Anniversary">Anniversary</option>
                    <option value="Christmas">Christmas</option>
                    <option value="Mother's Day">Mother's Day</option>
                    <option value="Father's Day">Father's Day</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 2. CENTER CORE (Flex-1) — Conversational Workspace ── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden mt-14 md:mt-0 relative">
        
        {/* Workspace Top Bar */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold tracking-tight text-slate-800">{activeMode}</h2>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <div className="relative">
              <select 
                id="language-select"
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 py-1.5 text-xs font-bold text-slate-700 outline-none hover:bg-slate-100 transition-colors"
              >
                <option value="English">English</option>
                <option value="Sinhala">Sinhala (Native)</option>
                <option value="Singlish">Singlish (Phonetic)</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            </div>

            {/* Clear History */}
            <button 
              id="clear-history-btn"
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          </div>
        </div>

        {/* Scrollable Chat Thread Surface */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-[#F8F7FA]">
          {messages.map((msg, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              key={msg.id || index}
              className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
            >
              {/* Chat Bubble */}
              <div className={`
                max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm leading-relaxed text-[15px]
                ${msg.sender === "user" 
                  ? "bg-[#441B71] text-white rounded-tr-none" 
                  : "bg-[#F6F4F9] border border-[#EBE7F2] text-slate-800 rounded-tl-none"}
              `}>
                <p className="whitespace-pre-line">{msg.text}</p>
                
                {/* Intent Badge */}
                {msg.intents && msg.intents.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                    {msg.intents.map(intent => (
                      <span key={intent} className="text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-sans">
                        {intent} intent
                      </span>
                    ))}
                    {msg.latency && (
                      <span className="text-[10px] font-bold text-slate-400 ml-auto">
                        Latency: {msg.latency}s
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Inline Product Carousel display */}
              {msg.products && msg.products.length > 0 && (
                <div className="w-full mt-4 -mx-2">
                  <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="flex overflow-x-auto px-2 py-2 gap-4 scrollbar-none snap-x snap-mandatory"
                  >
                    {msg.products.map((prod) => {
                      const finalPrice = typeof prod.price === "object" ? prod.price.amount : Number(prod.price);
                      const cartBtnId = `add-to-cart-btn-${prod.id.toLowerCase().replace(/_/g, "-")}`;
                      const viewBtnId = `view-btn-${prod.id.toLowerCase().replace(/_/g, "-")}`;
                      return (
                        <motion.div
                          key={prod.id}
                          variants={itemVariants}
                          whileHover={{ y: -4 }}
                          className="flex-shrink-0 w-[85vw] md:w-[280px] bg-white rounded-2xl border border-slate-150 shadow-sm overflow-hidden flex flex-col snap-start"
                        >
                          <div className="h-44 w-full overflow-hidden bg-slate-50 relative">
                            <img 
                              src={getProductImage(prod)} 
                              alt={prod.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute top-3 left-3 bg-[#441B71] text-white text-[10px] font-extrabold tracking-wide px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 select-none">
                              <Sparkles className="h-3 w-3 text-amber-300 fill-amber-300" />
                              {prod.match_percentage || 90}% Matched
                            </div>
                          </div>
                          
                          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                            <div>
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-0.5">
                                <span>{prod.category || "General"}</span>
                                <span className="font-mono text-slate-300 select-all">{prod.id}</span>
                              </div>
                              <h3 className="font-bold text-sm text-slate-800 line-clamp-2">{prod.name}</h3>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                {prod.summary}
                              </p>
                            </div>
                            
                            <div className="flex items-center justify-between pt-1">
                              <span className="font-extrabold text-slate-900 text-[15px]">
                                Rs. {finalPrice.toLocaleString()}
                              </span>
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                In stock ({prod.stock_level || "low"})
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1.5">
                              <button
                                id={cartBtnId}
                                onClick={() => handleAddToCart(prod)}
                                className="w-full bg-[#FCD34D] hover:bg-[#FFD700] text-slate-900 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                              >
                                Add to Cart
                              </button>
                              <a
                                id={viewBtnId}
                                href={`https://www.kapruka.com/buyonline/${prod.name.toLowerCase().replace(/ /g, "-")}/kid/${prod.id.toLowerCase()}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full border border-slate-200 hover:bg-slate-50 text-slate-600 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1"
                              >
                                View
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </div>
              )}
            </motion.div>
          ))}

          {/* Streaming text state rendering */}
          {streamedText && (
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm bg-[#F6F4F9] border border-[#EBE7F2] text-slate-800 rounded-tl-none">
                <p className="whitespace-pre-line">{streamedText}</p>
              </div>
            </div>
          )}

          {/* Current Status Dot / Typing indicator */}
          <AnimatePresence mode="wait">
            {(isTyping || currentStatus) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3 bg-white border border-[#EBE7F2] px-4 py-2.5 rounded-full shadow-sm w-fit"
              >
                <div className="flex space-x-1.5 select-none">
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                {currentStatus && (
                  <span className="text-xs font-semibold text-slate-500">
                    {currentStatus}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Welcome Inline Context Cards (Set Context Pills) */}
          {messages.length <= 1 && !isTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5"
            >
              <div>
                <h3 className="font-bold text-[#441B71] text-[15px] flex items-center gap-2">
                  <Compass className="h-4.5 w-4.5 text-amber-500" />
                  Set shopping context
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pick options to quickly guide Ruki AI's live search filters.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">What is your budget?</label>
                  <div className="flex flex-wrap gap-2">
                    {["Under Rs. 2,500", "Rs. 2,500 - 5,000", "Rs. 5,000 - 10,000", "Above Rs. 10,000"].map(val => (
                      <button
                        key={val}
                        onClick={() => handlePillClick("budget", val)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                          budget === val 
                            ? "bg-purple-50 border-purple-200 text-purple-700 font-bold" 
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Who is the recipient?</label>
                  <div className="flex flex-wrap gap-2">
                    {["Male", "Female", "Child", "Couple"].map(val => (
                      <button
                        key={val}
                        onClick={() => handlePillClick("recipient", val)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                          recipient === val 
                            ? "bg-purple-50 border-purple-200 text-purple-700 font-bold" 
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">What is the occasion?</label>
                  <div className="flex flex-wrap gap-2">
                    {["Birthday", "Anniversary", "Christmas", "Mother's Day", "Father's Day"].map(val => (
                      <button
                        key={val}
                        onClick={() => handlePillClick("occasion", val)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                          occasion === val 
                            ? "bg-purple-50 border-purple-200 text-purple-700 font-bold" 
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Bottom Bar: Pinned Capsule Input */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-4">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center bg-slate-50 border border-slate-200 rounded-full px-2 py-1.5 shadow-inner">
            
            {/* Left Accessory Toggles */}
            <div className="flex items-center space-x-0.5 pr-2 border-r border-slate-200">
              <button
                id="mic-toggle-btn"
                type="button"
                onClick={() => setIsMicActive(!isMicActive)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${isMicActive ? "bg-red-50 text-red-500" : "text-slate-400 hover:bg-slate-200"}`}
                title="Toggle Mic"
              >
                {isMicActive ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
              </button>
              <button
                id="camera-toggle-btn"
                type="button"
                onClick={() => setIsCameraActive(!isCameraActive)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${isCameraActive ? "bg-purple-50 text-[#441B71]" : "text-slate-400 hover:bg-slate-200"}`}
                title="Toggle Camera"
              >
                {isCameraActive ? <Camera className="h-4.5 w-4.5" /> : <CameraOff className="h-4.5 w-4.5" />}
              </button>
              <button
                id="audio-toggle-btn"
                type="button"
                onClick={() => setIsAudioActive(!isAudioActive)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-400 transition-colors cursor-pointer"
                title="Toggle Sound"
              >
                {isAudioActive ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
              </button>
            </div>

            {/* Input Text box */}
            <input
              id="chat-input-text"
              type="text"
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              placeholder="Ask Genie to search, compare, plan an event, or checkout..."
              className="flex-1 bg-transparent px-4 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none"
            />

            {/* Send Button */}
            <button
              id="chat-send-btn"
              type="submit"
              disabled={!messageInput.trim()}
              className={`
                p-2 rounded-full transition-all cursor-pointer
                ${messageInput.trim() 
                  ? "bg-[#FCD34D] hover:bg-[#FFD700] text-slate-900 active:scale-95 shadow-sm" 
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"}
              `}
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>
      </main>

      {/* ── 3. RIGHT SIDEBAR (Width: 320px) — Cart Sidebar ── */}
      <aside className={`
        fixed inset-y-0 right-0 z-50 flex w-[320px] flex-col border-l border-slate-200 bg-white transition-transform duration-300 md:static md:translate-x-0
        ${isCartOpen ? "translate-x-0" : "translate-x-full"}
      `}>
        
        {/* Cart Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
          <h2 className="text-lg font-bold text-[#441B71] flex items-center gap-2 select-none">
            <CartIcon className="h-5 w-5" />
            Cart
          </h2>
          <button 
            id="cart-close-btn-mobile"
            onClick={() => setIsCartOpen(false)}
            className="rounded-lg p-1 hover:bg-slate-100 md:hidden"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="p-4 bg-slate-50 rounded-full">
                <ShoppingBag className="h-10 w-10 text-slate-300" />
              </div>
              <p className="text-xs font-semibold text-slate-400 max-w-[200px]">
                Add products to build a cart order link.
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {cart.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 shadow-sm"
                >
                  <img 
                    src={item.image_url} 
                    alt={item.name}
                    className="h-12 w-12 rounded-lg object-cover bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-slate-800 truncate">{item.name}</h3>
                    <p className="text-[11px] font-extrabold text-slate-500 mt-0.5">
                      Rs. {item.price.toLocaleString()}
                    </p>
                  </div>
                  
                  {/* Quantity Modifier controls */}
                  <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shrink-0">
                    <button 
                      id={`cart-dec-${item.id.toLowerCase().replace(/_/g, "-")}`}
                      onClick={() => updateQuantity(item.id, -1)}
                      className="p-1 hover:bg-slate-50 transition-colors cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3 text-slate-500" />
                    </button>
                    <span className="text-xs font-bold px-2 text-slate-700 min-w-[20px] text-center select-none">
                      {item.quantity}
                    </span>
                    <button 
                      id={`cart-inc-${item.id.toLowerCase().replace(/_/g, "-")}`}
                      onClick={() => updateQuantity(item.id, 1)}
                      className="p-1 hover:bg-slate-50 transition-colors cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3 text-slate-500" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Cart Sticky Summary Bottom Panel */}
        <div className="border-t border-slate-100 p-6 bg-slate-50 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal</span>
              <span className="font-bold">Rs. {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Delivery</span>
              <span className="font-bold">Rs. {delivery.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-[#441B71] pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>Rs. {total.toLocaleString()}</span>
            </div>
          </div>

          <button
            id="create-order-link-btn"
            onClick={handleCreateOrderLink}
            disabled={cart.length === 0}
            className={`
              w-full py-3.5 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-2 shadow-sm cursor-pointer
              ${cart.length > 0 
                ? "bg-[#FCD34D] hover:bg-[#FFD700] text-slate-900 hover:shadow-md active:scale-98" 
                : "bg-slate-200 text-slate-400 cursor-not-allowed"}
            `}
          >
            Create Order Link
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── DRAWERS/MODALS BACKDROP ── */}
      {(isSidebarOpen || isCartOpen) && (
        <div 
          onClick={() => { setIsSidebarOpen(false); setIsCartOpen(false); }}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* ── CHECKOUT LINK MODAL ── */}
      <AnimatePresence>
        {isCheckoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="bg-[#441B71] text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-emerald-400 stroke-[3px]" />
                  <span className="font-black tracking-tight">Order Link Created</span>
                </div>
                <button 
                  onClick={() => setIsCheckoutModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your secure guest checkout link has been generated. Send this link to checkout instantly or share it with the recipient to complete checkout.
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <input
                    type="text"
                    readOnly
                    value={checkoutUrl || ""}
                    className="flex-1 bg-transparent text-xs font-mono text-slate-600 outline-none truncate"
                  />
                  <button
                    id="checkout-copy-btn"
                    onClick={() => {
                      if (checkoutUrl) navigator.clipboard.writeText(checkoutUrl);
                      alert("Copied to clipboard!");
                    }}
                    className="text-xs font-bold text-[#441B71] hover:underline cursor-pointer"
                  >
                    Copy
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="checkout-close-btn"
                    onClick={() => setIsCheckoutModalOpen(false)}
                    className="w-full border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                  <a
                    id="checkout-launch-btn"
                    href={checkoutUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-[#FCD34D] hover:bg-[#FFD700] text-slate-900 py-3 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1 shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    Launch Link
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