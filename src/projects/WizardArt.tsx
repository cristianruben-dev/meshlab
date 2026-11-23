import type { BoardSize } from '../breadboard/settings'
import type { PreferredView } from '../storage/types'

/** Stylized 2D schematic artwork for the New Project wizard. */
export function SchematicTypeArt() {
  return (
    <svg className="wizard-art" viewBox="0 0 220 124" fill="none" aria-hidden="true">
      <defs>
        <pattern id="wiz-sch-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1" fill="currentColor" opacity="0.16" />
        </pattern>
      </defs>
      <rect width="220" height="124" rx="10" fill="var(--canvas)" />
      <rect width="220" height="124" rx="10" fill="url(#wiz-sch-grid)" />
      {/* Orthogonal circuit loop */}
      <path
        d="M46 42 V28 H90 M134 28 H174 V50 M174 80 V98 H46 V82"
        stroke="var(--brand)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center branch */}
      <path d="M112 28 V42 M112 82 V98" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
      {/* Voltage source */}
      <circle cx="46" cy="62" r="17" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2.2" />
      <path d="M46 53 V61 M42 57 H50 M42 70 H50" stroke="var(--brand)" strokeWidth="2.1" strokeLinecap="round" />
      {/* Top resistor */}
      <path
        d="M90 28 L94 21 L101 35 L108 21 L115 35 L122 21 L129 35 L134 28"
        stroke="var(--foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center resistor */}
      <path
        d="M112 42 L106 46 L118 52 L106 58 L118 64 L106 70 L118 76 L112 82"
        stroke="var(--foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* LED on right branch */}
      <circle cx="174" cy="65" r="17" fill="#f59e0b" opacity="0.18" />
      <polygon points="165,54 183,54 174,72" fill="#f59e0b" fillOpacity="0.35" stroke="var(--foreground)" strokeWidth="2.1" strokeLinejoin="round" />
      <line x1="164" y1="73" x2="184" y2="73" stroke="var(--foreground)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M186 53 L194 45 M191 61 L199 53" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      {/* Junction nodes & ground */}
      <circle cx="112" cy="28" r="3.4" fill="var(--brand)" />
      <circle cx="112" cy="98" r="3.4" fill="var(--brand)" />
      <path d="M112 98 V107 M102 107 H122 M106 111 H118 M109.5 115 H114.5" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Stylized 3D-feel breadboard artwork for the New Project wizard. */
export function BreadboardTypeArt() {
  const cols = Array.from({ length: 12 }, (_, i) => 36 + i * 13.5)
  return (
    <svg className="wizard-art" viewBox="0 0 220 124" fill="none" aria-hidden="true">
      <rect width="220" height="124" rx="10" fill="var(--canvas)" />
      {/* Drop shadow & board body */}
      <rect x="20" y="18" width="180" height="92" rx="10" fill="#0f172a" opacity="0.16" />
      <rect x="18" y="14" width="184" height="92" rx="10" fill="#f4f6f7" stroke="#c4ced6" strokeWidth="1.8" />
      {/* Top & bottom power rail stripes */}
      <line x1="30" y1="22" x2="190" y2="22" stroke="#d94848" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="30" x2="190" y2="30" stroke="#3b72c9" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="90" x2="190" y2="90" stroke="#d94848" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="98" x2="190" y2="98" stroke="#3b72c9" strokeWidth="2" strokeLinecap="round" />
      {/* Center trench */}
      <rect x="26" y="56.5" width="168" height="7" rx="3" fill="#d3dce2" />
      {/* Socket holes */}
      {cols.map((x, idx) => (
        <g key={idx} fill="#475569" opacity="0.58">
          <rect x={x - 1.5} y="38" width="3" height="3" rx="0.8" />
          <rect x={x - 1.5} y="47" width="3" height="3" rx="0.8" />
          <rect x={x - 1.5} y="69" width="3" height="3" rx="0.8" />
          <rect x={x - 1.5} y="78" width="3" height="3" rx="0.8" />
        </g>
      ))}
      {/* Red power jumper */}
      <path d="M50 25 C50 32, 62 32, 63 39" stroke="#e04f4f" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* Axial resistor with color bands */}
      <line x1="63" y1="48.5" x2="117" y2="48.5" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="74" y="42.5" width="32" height="12" rx="5.5" fill="#e2be8a" stroke="#9d6d3b" strokeWidth="1.4" />
      <rect x="81" y="43" width="3" height="11" fill="#d94848" />
      <rect x="88" y="43" width="3" height="11" fill="#f59e0b" />
      <rect x="95" y="43" width="3" height="11" fill="#7c4a21" />
      {/* Green center bridge jumper */}
      <path d="M117 48 C126 54, 126 65, 117 70" stroke="#16a37f" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* Glowing LED */}
      <circle cx="144" cy="70" r="14" fill="#ff7a3d" opacity="0.28" />
      <line x1="130" y1="70.5" x2="158" y2="70.5" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="144" cy="70.5" r="7.5" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.4" />
      <circle cx="142" cy="68.5" r="2.6" fill="#fde68a" opacity="0.85" />
      {/* Blue return jumper */}
      <path d="M158 79 C160 88, 170 88, 172 95" stroke="#3b72c9" strokeWidth="3.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Proportional breadboard SVG showing Mini, Half, or Full size (and live split-rail break). */
export function BoardSizeArt({ size, splitRails = false }: { size: BoardSize; splitRails?: boolean }) {
  if (size === 'mini') {
    const cols = Array.from({ length: 7 }, (_, i) => 56 + i * 14.5)
    return (
      <svg className="wizard-size-art" viewBox="0 0 200 84" fill="none" aria-hidden="true">
        <rect x="44" y="13" width="112" height="60" rx="8" fill="#0f172a" opacity="0.12" />
        <rect x="42" y="10" width="116" height="60" rx="8" fill="#f4f6f7" stroke="#c4ced6" strokeWidth="1.6" />
        <rect x="49" y="37" width="102" height="6" rx="2.5" fill="#d0dae0" />
        {cols.map((x, i) => (
          <g key={i} fill="#475569" opacity="0.58">
            <rect x={x - 1.5} y="19" width="3" height="3" rx="0.8" />
            <rect x={x - 1.5} y="27" width="3" height="3" rx="0.8" />
            <rect x={x - 1.5} y="50" width="3" height="3" rx="0.8" />
            <rect x={x - 1.5} y="58" width="3" height="3" rx="0.8" />
          </g>
        ))}
      </svg>
    )
  }

  if (size === 'half') {
    const cols = Array.from({ length: 11 }, (_, i) => 36 + i * 12.8)
    return (
      <svg className="wizard-size-art" viewBox="0 0 200 84" fill="none" aria-hidden="true">
        <rect x="24" y="11" width="152" height="66" rx="8" fill="#0f172a" opacity="0.12" />
        <rect x="22" y="8" width="156" height="66" rx="8" fill="#f4f6f7" stroke="#c4ced6" strokeWidth="1.6" />
        <line x1="32" y1="15" x2="168" y2="15" stroke="#d94848" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="32" y1="21" x2="168" y2="21" stroke="#3b72c9" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="32" y1="61" x2="168" y2="61" stroke="#d94848" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="32" y1="67" x2="168" y2="67" stroke="#3b72c9" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="30" y="38" width="140" height="5.5" rx="2.5" fill="#d0dae0" />
        {cols.map((x, i) => (
          <g key={i} fill="#475569" opacity="0.55">
            <rect x={x - 1.3} y="27" width="2.6" height="2.6" rx="0.6" />
            <rect x={x - 1.3} y="32" width="2.6" height="2.6" rx="0.6" />
            <rect x={x - 1.3} y="47" width="2.6" height="2.6" rx="0.6" />
            <rect x={x - 1.3} y="52" width="2.6" height="2.6" rx="0.6" />
          </g>
        ))}
      </svg>
    )
  }

  // Full size (63 columns)
  const cols = Array.from({ length: 19 }, (_, i) => 17 + i * 9.2)
  const railSpans = splitRails ? [[15, 92], [108, 185]] : [[15, 185]]
  return (
    <svg className="wizard-size-art" viewBox="0 0 200 84" fill="none" aria-hidden="true">
      <rect x="8" y="13" width="184" height="62" rx="8" fill="#0f172a" opacity="0.12" />
      <rect x="6" y="10" width="188" height="62" rx="8" fill="#f4f6f7" stroke="#c4ced6" strokeWidth="1.6" />
      {railSpans.map(([a, b], idx) => (
        <g key={idx}>
          <line x1={a} y1="16.5" x2={b} y2="16.5" stroke="#d94848" strokeWidth="1.8" strokeLinecap="round" />
          <line x1={a} y1="22" x2={b} y2="22" stroke="#3b72c9" strokeWidth="1.8" strokeLinecap="round" />
          <line x1={a} y1="60" x2={b} y2="60" stroke="#d94848" strokeWidth="1.8" strokeLinecap="round" />
          <line x1={a} y1="65.5" x2={b} y2="65.5" stroke="#3b72c9" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
      <rect x="13" y="38.5" width="174" height="5" rx="2.5" fill="#d0dae0" />
      {cols.map((x, i) => (
        <g key={i} fill="#475569" opacity="0.52">
          <rect x={x - 1.1} y="27.5" width="2.2" height="2.2" rx="0.5" />
          <rect x={x - 1.1} y="32.5" width="2.2" height="2.2" rx="0.5" />
          <rect x={x - 1.1} y="47.5" width="2.2" height="2.2" rx="0.5" />
          <rect x={x - 1.1} y="52.5" width="2.2" height="2.2" rx="0.5" />
        </g>
      ))}
    </svg>
  )
}

/** Artwork for the "Start blank" card in Step 3 of the wizard. */
export function BlankStartArt({ type, boardSize = 'half' }: { type: PreferredView; boardSize?: BoardSize }) {
  if (type === 'board') {
    return (
      <div className="wizard-art-wrap">
        <BoardSizeArt size={boardSize} />
      </div>
    )
  }
  return (
    <svg className="wizard-art wizard-art-sm" viewBox="0 0 200 84" fill="none" aria-hidden="true">
      <defs>
        <pattern id="wiz-blank-grid" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1" fill="currentColor" opacity="0.18" />
        </pattern>
      </defs>
      <rect width="200" height="84" rx="8" fill="var(--canvas)" />
      <rect width="200" height="84" rx="8" fill="url(#wiz-blank-grid)" />
      <rect x="74" y="20" width="52" height="44" rx="10" stroke="var(--brand)" strokeWidth="1.6" strokeDasharray="4 4" fill="var(--brand-soft)" />
      <path d="M100 34 V50 M92 42 H108" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** Artwork for the "From template" card in Step 3 of the wizard. */
export function TemplateStartArt() {
  return (
    <svg className="wizard-art wizard-art-sm" viewBox="0 0 200 84" fill="none" aria-hidden="true">
      <rect width="200" height="84" rx="8" fill="var(--canvas)" />
      {/* Three fanned mini blueprint cards */}
      <rect x="20" y="18" width="52" height="48" rx="7" fill="var(--card)" stroke="var(--border)" strokeWidth="1.4" />
      <path d="M30 42 H40 L44 35 L49 49 L54 42 H62" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="128" y="18" width="52" height="48" rx="7" fill="var(--card)" stroke="var(--border)" strokeWidth="1.4" />
      <path d="M138 42 H150 M150 32 V52 M157 32 V52 M157 42 H170" stroke="var(--muted-foreground)" strokeWidth="1.8" strokeLinecap="round" />
      {/* Center highlighted blueprint */}
      <rect x="64" y="11" width="72" height="62" rx="9" fill="var(--card)" stroke="var(--brand)" strokeWidth="1.8" />
      <path d="M76 34 V24 H94 L98 19 L103 29 L108 19 L112 24 H124 V58 H76 V48" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="76" cy="41" r="7" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.7" />
      <circle cx="124" cy="41" r="4.5" fill="#f59e0b" />
    </svg>
  )
}

/** Layered hero illustration for the empty Projects Hub. */
export function EmptyWorkspaceArt() {
  return (
    <svg className="hub-hero-art" viewBox="0 0 280 124" fill="none" aria-hidden="true">
      {/* Left schematic card */}
      <g transform="rotate(-4 74 64)">
        <rect x="16" y="18" width="122" height="84" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="1.6" />
        <path d="M34 50 V34 H66 L70 28 L76 40 L82 28 L88 40 L92 34 H118 V82 H34 V68" stroke="var(--brand)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="34" cy="59" r="9" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.9" />
        <circle cx="118" cy="58" r="5" fill="#f59e0b" />
      </g>
      {/* Right breadboard card */}
      <g transform="rotate(4 202 64)">
        <rect x="142" y="22" width="122" height="84" rx="12" fill="#f4f6f7" stroke="#c4ced6" strokeWidth="1.6" />
        <line x1="154" y1="32" x2="252" y2="32" stroke="#d94848" strokeWidth="2" strokeLinecap="round" />
        <line x1="154" y1="96" x2="252" y2="96" stroke="#3b72c9" strokeWidth="2" strokeLinecap="round" />
        <rect x="152" y="61" width="102" height="6" rx="2.5" fill="#d0dae0" />
        <rect x="174" y="45" width="26" height="10" rx="5" fill="#e2be8a" stroke="#9d6d3b" strokeWidth="1.2" />
        <circle cx="224" cy="78" r="7" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.3" />
        <path d="M200 50 C208 56, 208 72, 217 78" stroke="#16a37f" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  )
}
