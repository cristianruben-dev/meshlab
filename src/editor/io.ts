import { validateCircuit, type Circuit } from '../circuit/model'

const storageKey = 'meshlab:circuit:v1'
export function loadCircuit(fallback: Circuit) {
  try {
    const json = localStorage.getItem(storageKey)
    return json ? validateCircuit(JSON.parse(json)) : fallback
  } catch { return fallback }
}
export function saveCircuit(circuit: Circuit) {
  localStorage.setItem(storageKey, JSON.stringify(circuit))
}
function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
export function exportJson(circuit: Circuit) {
  download(new Blob([JSON.stringify(circuit, null, 2)], { type: 'application/json' }), 'meshlab-circuit.json')
}
export async function importJson(file: File) {
  if (file.size > 2_000_000) throw new Error('This circuit file exceeds 2 MB.')
  return validateCircuit(JSON.parse(await file.text()))
}
export async function exportPng(svg: SVGSVGElement, view: { x: number; y: number; scale: number }) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.querySelectorAll('[data-export="hide"]').forEach(node => node.remove())
  copy.setAttribute('width', '2400')
  copy.setAttribute('height', '1620')
  copy.setAttribute('font-family', 'monospace')
  const background = copy.querySelector(':scope > rect')
  if (background) {
    background.setAttribute('x', '0'); background.setAttribute('y', '0')
    background.setAttribute('width', '800'); background.setAttribute('height', '540')
  }
  // Export the same viewport as displayed, including pan and zoom.
  copy.querySelector(':scope > g')?.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`)
  const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1620
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PNG rendering is unavailable.')
    context.drawImage(image, 0, 0)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Could not encode the image.')
    download(png, 'meshlab-circuit.png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
