"use client";

import React from "react";

interface RukiLogoProps {
  className?: string;
  animateHover?: boolean;
}

export function RukiLogo({ className = "w-16 h-16", animateHover = true }: RukiLogoProps) {
  // Composing class names locally to prevent Next.js project dependency errors
  const baseClasses = "select-none fill-none transition-transform duration-300 ease-out";
  const hoverClasses = animateHover ? "hover:scale-105 hover:rotate-[2deg]" : "";
  const combinedClassName = `${baseClasses} ${hoverClasses} ${className}`.trim();

  return (
    <svg
      className={combinedClassName}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Liquid Gold Smile Ring Gradient */}
        <linearGradient id="kaprukaGoldSmile" x1="10" y1="70" x2="90" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE082" stopOpacity="0.2" />
          <stop offset="15%" stopColor="#FFCA28" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="85%" stopColor="#FFB300" />
          <stop offset="100%" stopColor="#FF8F00" stopOpacity="0.8" />
        </linearGradient>

        {/* Brand Purple for the Eyes */}
        <linearGradient id="rukiPurpleEye" x1="30" y1="30" x2="70" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6C34C4" />
          <stop offset="100%" stopColor="#3c1b63" />
        </linearGradient>
      </defs>

      {/* Left Eye Dot */}
      <circle 
        cx="35" 
        cy="40" 
        r="5.5" 
        fill="url(#rukiPurpleEye)" 
      />

      {/* Right Eye Dot */}
      <circle 
        cx="65" 
        cy="40" 
        r="5.5" 
        fill="url(#rukiPurpleEye)" 
      />

      {/* The Signature Parabolic Kapruka Yellow Gold Smile Ring Mouth */}
      <path
        d="M 22 58 
           C 36 76, 64 76, 78 58"
        stroke="url(#kaprukaGoldSmile)"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}