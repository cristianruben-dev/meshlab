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
    canvas: '#fbfcfd',
    gridMinor: '#dfe4ea',
    gridMajor: '#c3ccd7',
    ink: '#273445',
    inkMuted: '#5d6b7d',
    label: '#152131',
    value: '#5a687a',
    wire: '#3d7f8c',
    wireCasing: '#fbfcfd',
    pin: '#3d7f8c',
    junction: '#0f8c7a',
    node: '#0b7a6b',
    current: '#e08a00',
    selected: '#0d8a78',
    selectedFill: '#0d8a7814',
    selectedStroke: '#0d8a78',
    flagged: '#c2650a',
    handleFill: '#ffffff',
    draft: '#0d8a78',
    positive: '#0c9a76',
    negative: '#8b4fd6',
    zero: '#5b8790',
    scopeBackground: '#fbfcfd',
    scopeGrid: '#e1e6ec',
    scopeText: '#5a687a',
    trace: '#0d8a78',
  },
  dark: {
    canvas: '#0a1019',
    gridMinor: '#1f2a3a',
    gridMajor: '#33425a',
    ink: '#cfd9e8',
    inkMuted: '#8a9bb2',
    label: '#eef3fa',
    value: '#93a6bd',
    wire: '#5b8f9b',
    wireCasing: '#0a1019',
    pin: '#7fb2b6',
    junction: '#6fe0c8',
    node: '#7fdcc4',
    current: '#ffd166',
    selected: '#6eecd0',
    selectedFill: '#6eecd014',
    selectedStroke: '#3dc0a5',
    flagged: '#ffb454',
    handleFill: '#121b27',
    draft: '#65efcf',
    positive: '#5bd9ad',
    negative: '#c08cff',
    zero: '#4c8890',
    scopeBackground: '#0a1019',
    scopeGrid: '#22314a',
    scopeText: '#9fb1c8',
    trace: '#68ecc9',
  },
}
