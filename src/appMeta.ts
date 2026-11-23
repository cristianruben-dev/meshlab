export const APP_NAME = 'Meshlab'
export const APP_VERSION = '1.0.0'
export const AUTHOR_HANDLE = 'cristianruben-dev'
export const GITHUB_REPO_SLUG = 'cristianruben-dev/meshlab'
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_SLUG}`

export type ReleaseNote = {
  version: string
  tag: string
  items: readonly string[]
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.0.0',
    tag: 'Initial release',
    items: [
      '2D schematic editor with DC and transient Modified Nodal Analysis (MNA) solver and oscilloscope.',
      'Interactive 3D breadboard (Mini, Half, Full) with free-form placement, jumper wires, and voltage probing.',
      'Local multi-project workspace in IndexedDB with folders, JSON backup import/export, and PNG schematic export.',
      'IEC 60062 resistor color code calculator (4 & 5 bands, E12/E24 lookup) linked to the component inspector.',
      'Light/dark themes and bilingual EN/ES interface.',
    ],
  },
] as const
