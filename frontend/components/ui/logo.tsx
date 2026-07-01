import React from "react";

export function RukiLogo({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Deep Kapruka Purple Gradient */}
        <linearGradient id="purpleGrad" x1="20" y1="20" x2="60" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5B2D9A" />
          <stop offset="100%" stopColor="#3c1b63" />
        </linearGradient>

        {/* Dynamic Kapruka Yellow/Gold Smile Arc Gradient */}
        <linearGradient id="goldSmileGrad" x1="15" y1="75" x2="85" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE57F" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFA000" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Main Structural Letter "R" Body */}
      <path
        d="M 28 20 
           L 52 20 
           C 68 20, 68 44, 52 44 
           L 28 44 
           Z"
        fill="url(#purpleGrad)"
      />
      <path
        d="M 28 20 
           L 28 72"
        stroke="url(#purpleGrad)"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* The Signature Kapruka Gold Smile Ring Asset */}
      <path
        d="M 22 68 
           Q 50 88, 78 68"
        stroke="url(#goldSmileGrad)"
        strokeWidth="7.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Connecting Dynamic Leg blending R into the Ring */}
      <path
        d="M 44 44 
           Q 54 56, 64 68"
        stroke="url(#purpleGrad)"
        strokeWidth="8.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Minimal AI Sentient Diamond Spark */}
      <path
        d="M 72 24 
           Q 78 30, 84 30 
           Q 78 30, 78 36 
           Q 78 30, 72 30 
           Q 78 30, 72 24 Z"
        fill="#FFD700"
      />
    </svg>
  );
}