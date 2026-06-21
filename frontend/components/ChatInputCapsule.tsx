"use client";

import React from "react";
import { Mic, MicOff, Camera, CameraOff, Volume2, VolumeX, Send } from "lucide-react";

interface ChatInputCapsuleProps {
  messageInput: string;
  setMessageInput: (val: string) => void;
  isMicActive: boolean;
  setIsMicActive: (v: boolean) => void;
  isCameraActive: boolean;
  setIsCameraActive: (v: boolean) => void;
  isAudioActive: boolean;
  setIsAudioActive: (v: boolean) => void;
  onSend: () => void;
}

export function ChatInputCapsule({
  messageInput,
  setMessageInput,
  isMicActive,
  setIsMicActive,
  isCameraActive,
  setIsCameraActive,
  isAudioActive,
  setIsAudioActive,
  onSend,
}: ChatInputCapsuleProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3 md:px-6 md:pb-5">
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border bg-surface/80 px-2.5 py-2 shadow-lg backdrop-blur-md focus-within:ring-1 focus-within:ring-ring/40">
        <button
          id="mic-toggle-btn"
          type="button"
          aria-label="Voice"
          onClick={() => setIsMicActive(!isMicActive)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${
            isMicActive
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          }`}
        >
          {isMicActive ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
        </button>

        <button
          id="camera-toggle-btn"
          type="button"
          aria-label="Camera"
          onClick={() => setIsCameraActive(!isCameraActive)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${
            isCameraActive
              ? "bg-primary-soft text-primary"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          }`}
        >
          {isCameraActive ? <Camera className="h-4.5 w-4.5" /> : <CameraOff className="h-4.5 w-4.5" />}
        </button>

        <button
          id="audio-toggle-btn"
          type="button"
          aria-label="Audio"
          onClick={() => setIsAudioActive(!isAudioActive)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300 ease-in-out hover:scale-105 active:scale-95 cursor-pointer ${
            isAudioActive
              ? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          }`}
        >
          {isAudioActive ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
        </button>

        <input
          id="chat-input-text"
          value={messageInput}
          onChange={e => setMessageInput(e.target.value)}
          placeholder="Ask Ruki to search, compare, plan an event…"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium outline-none placeholder:text-muted-foreground/80 text-foreground"
          onKeyDown={e => e.key === "Enter" && onSend()}
        />

        <button
          id="chat-send-btn"
          onClick={onSend}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-black shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 hover:shadow-[0_0_18px_rgba(255,215,0,0.5)] active:scale-[0.97] disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: "#FFD700", color: "#0B0410" }}
          disabled={!messageInput.trim()}
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </div>
    </div>
  );
}
