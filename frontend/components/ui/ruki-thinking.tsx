"use client";

/**
 * RukiThinkingMark — the animated loading mark shown while Ruki is working,
 * in the spirit of Claude's pulsing-logo loader.
 *
 * Plays a self-hosted Lottie dot-spinner (public/lottie/ruki-thinking-loader.json
 * — a recolored copy of the original loading.json dot-spinner, remapped from
 * its stock pink→orange gradient to the brand purple→Kapruka-gold gradient)
 * via the DotLottie WASM player already used by RukiMascot.tsx.
 *
 * Falls back to a small CSS spinner if the WASM player fails to load/render
 * (offline, CDN blocked) so the loading indicator itself never breaks.
 */

import React, { useCallback, useState } from "react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";

const THINKING_LOADER_SRC = "/lottie/ruki-thinking-loader.json";

interface RukiThinkingMarkProps {
  className?: string;
}

export function RukiThinkingMark({ className = "h-9 w-9" }: RukiThinkingMarkProps) {
  const [failed, setFailed] = useState(false);

  const setRef = useCallback((dl: DotLottie | null) => {
    if (!dl) return;
    dl.addEventListener("loadError", () => setFailed(true));
    dl.addEventListener("renderError", () => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div
        className={`shrink-0 rounded-full border-2 border-primary-vivid/30 border-t-amber animate-spin ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className={`shrink-0 ${className}`} aria-hidden="true">
      <DotLottieReact
        src={THINKING_LOADER_SRC}
        loop
        autoplay
        dotLottieRefCallback={setRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
