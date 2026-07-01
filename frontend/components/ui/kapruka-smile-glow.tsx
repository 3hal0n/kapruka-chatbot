import * as React from "react";

/**
 * KaprukaSmileGlow — ambient hero background decoration.
 *
 * Draws a single arc trimmed from a much larger (1600px) circle so only a
 * wide, shallow slice is visible — oriented like the Kapruka smile mark.
 * Pure inline SVG (no images/canvas), absolutely positioned to fill its
 * relatively-positioned parent, and meant to sit behind hero content.
 */
export function KaprukaSmileGlow() {
  // Circle geometry — deliberately oversized (1600px diameter) so the arc
  // we slice out reads as a soft, generous curve rather than a full ring.
  const R = 800;
  const CX = 800;
  const CY = 0;
  const HALF_ANGLE = 50; // degrees either side of straight-down
  const PAD = 90; // room for stroke + blur bloom

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Sample points explicitly along the known circle (rather than relying on
  // SVG's arc-command center-solving, which is ambiguous for two points +
  // radius and can just as easily resolve to the mirrored frown-shaped arc).
  const STEPS = 48;
  const points: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const deg = 90 - HALF_ANGLE + (i / STEPS) * (HALF_ANGLE * 2);
    const rad = toRad(deg);
    points.push([CX + R * Math.cos(rad), CY + R * Math.sin(rad)]);
  }

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;

  const pathD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMax meet"
        className="kapruka-smile-glow absolute bottom-[6%] left-1/2 h-auto w-[clamp(1400px,150vw,1800px)] -translate-x-1/2"
      >
        <defs>
          <linearGradient id="kaprukaSmileStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F5C242" />
            <stop offset="50%" stopColor="#FFD966" />
            <stop offset="100%" stopColor="#F5C242" />
          </linearGradient>
          <linearGradient id="kaprukaSmileFeather" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="14%" stopColor="#fff" stopOpacity="1" />
            <stop offset="86%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="kaprukaSmileMask">
            <path d={pathD} fill="none" stroke="url(#kaprukaSmileFeather)" strokeWidth="40" strokeLinecap="round" />
          </mask>
        </defs>

        <path
          d={pathD}
          fill="none"
          stroke="url(#kaprukaSmileStroke)"
          strokeWidth="3"
          strokeLinecap="round"
          mask="url(#kaprukaSmileMask)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <style>{`
        .kapruka-smile-glow {
          opacity: 0.72;
          filter:
            drop-shadow(0 0 6px rgba(245, 194, 66, 0.55))
            drop-shadow(0 0 22px rgba(255, 217, 102, 0.45))
            drop-shadow(0 0 60px rgba(255, 217, 102, 0.32))
            drop-shadow(0 0 130px rgba(245, 194, 66, 0.16));
          animation: kapruka-smile-breathe 10s ease-in-out infinite;
        }
        @keyframes kapruka-smile-breathe {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.78; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kapruka-smile-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}
