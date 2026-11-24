import type { Theme } from './theme'

/**
 * Literal SVG colors per theme. The schematic is exported by serializing its SVG,
 * so these stay plain hex values instead of CSS custom properties.
 */
export type Palette = {
  canvas: string
  gridMinor: string
  gridMajor: string
  ink: string
  inkMuted: string
  label: string
  value: string
  wire: string
  wireCasing: string
  pin: string
  junction: string
  node: string
  current: string
  selected: string
  selectedFill: string
  selectedStroke: string
  flagged: string
  handleFill: string
  draft: string
  positive: string
  negative: string
  zero: string
  scopeBackground: string
  scopeGrid: string
  scopeText: string
  trace: string
}

export const palettes: Record<Theme, Palette> = {
  light: {
    canvas: '#f5f5f5',
    gridMinor: '#dedee3',
    gridMajor: '#c4c4cc',
    ink: '#26262f',
    inkMuted: '#6e6e6e',
    label: '#0a0a0f',
    value: '#666666',
    wire: '#3d7f8c',
    wireCasing: '#f5f5f5',
    pin: '#3d7f8c',
    junction: '#0f8c7a',
    node: '#0b7a6b',
    current: '#e08a00',
    selected: '#2563eb',
    selectedFill: '#2563eb14',
    selectedStroke: '#2563eb',
    flagged: '#c2650a',
    handleFill: '#ffffff',
    draft: '#2563eb',
    positive: '#0c9a76',
    negative: '#8b4fd6',
    zero: '#5b8790',
    scopeBackground: '#fafafa',
    scopeGrid: '#e5e5e5',
    scopeText: '#666666',
    trace: '#0d8a78',
  },
  dark: {
    canvas: '#0a0a0f',
    gridMinor: '#1d1d25',
    gridMajor: '#2e2e38',
    ink: '#e4e4e9',
    inkMuted: '#8b8b96',
    label: '#f5f5f7',
    value: '#a3a3ad',
    wire: '#5b8f9b',
    wireCasing: '#0a0a0f',
    pin: '#7fb2b6',
    junction: '#6fe0c8',
    node: '#7fdcc4',
    current: '#ffd166',
    selected: '#60a5fa',
    selectedFill: '#3b82f614',
    selectedStroke: '#3b82f6',
    flagged: '#ffb454',
    handleFill: '#191921',
    draft: '#60a5fa',
    positive: '#5bd9ad',
    negative: '#c08cff',
    zero: '#4c8890',
    scopeBackground: '#0a0a0f',
    scopeGrid: '#26262f',
    scopeText: '#a3a3ad',
    trace: '#68ecc9',
  },
}
