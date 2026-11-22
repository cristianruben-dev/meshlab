# Meshlab — DC circuit workbench

Edit and simulate multi-loop DC circuits in the browser. The workbench starts with a 12 V divider; its output is 8 V and its resistor current is 4 mA.

## Run locally

```sh
npm ci
npm run dev
```

Use a recent Node.js version supported by Vite 8. `npm test` runs solver, topology, and DOM integration tests; `npm run build` type-checks and builds the app.

For browser tests, install Chromium once with `npx playwright install chromium`, then run `npm run test:e2e`.

## Edit a circuit

- Pick a part from the library, then drag it. Shift-click or drag a selection box to select multiple parts. Press **R** to rotate and **Delete** to remove.
- Copy and paste selected components within the workbench, or duplicate them directly. Internal wires move with the selection; external connections stay behind. Use **Ctrl/Cmd+C**, **Ctrl/Cmd+V**, or **Ctrl/Cmd+D**.
- Select an existing wire and drag a circular handle to move that segment without changing its electrical connections.
- Click a terminal, then another terminal or wire. Connecting to a wire creates a junction; crossing wires without a junction does not connect them. Press **Esc** to cancel.
- Use the mouse wheel to zoom, the Pan tool or middle button to move the viewport, and **Fit to circuit** to re-center.
- Edit a selected part in the inspector. Values accept SI prefixes, for example `4.7 kΩ`, `500 mV`, or `25 mA`. Click an SPST switch to toggle it; use Shift-click to select it without toggling.
- Press **Space** to pause or resume. The app saves circuit edits locally; use **JSON** to share an editable copy or **PNG** for a 2400 × 1620 image of the current viewport.

In the inspector, use **Electrical limits** to set a rated current or absorbed power. Set a limit to zero to disable it. LEDs default to 20 mA. Use **Locate** in an alert to bring the affected part or node into view.

## Themes

Use the theme control in the top bar to choose **System**, **Light**, or **Dark**. The app follows the operating system until you pick Light or Dark, then remembers that choice in this browser. Exported PNG images use the colors of the active theme.

## Workspace

The schematic or the 3D breadboard fills the screen. Everything else opens as a panel over it: **Library**, **Inspector**, **Display**, **Results**, **Oscilloscope** (with transient analysis), and **Breadboard settings** (in breadboard view).

| Action | How |
|--------|-----|
| Open or close a panel | Use the launcher buttons, or the **×** on the panel. |
| Float or dock | Use the pin button. Pinned panels make room in the editor; floating panels sit on top with a shadow. |
| Keyboard | **Esc** closes a floating panel when focus is inside it. |

Panel layout is remembered separately for wide and narrow screens. On phones, panels open as bottom sheets.

## Breadboard view

Choose **Breadboard**, then open **Voltage Divider** or **LED + Switch**. The 3D board shows the assembled reference layout. Click a socket to read its voltage to ground, or a part to select it. Drag to orbit and scroll to zoom. From the keyboard, focus the board, move the socket cursor with the arrow keys, and press **Enter** to probe.

In **Breadboard settings**, choose a size and the board features:

| Size | Tie points | Layout |
|------|-----------:|--------|
| Mini | 170 | 17 columns, no power rails |
| Half | 400 | 30 columns, four power rails |
| Full | 830 | 63 columns, four power rails; rails can be split in the middle |

You can also turn the power rails and socket labels on or off. Reference layouts adapt to the size; without rails, power leads go straight into the terminal strips. Some real boards have split rails, so [check your hardware for continuity](https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard/) before following a layout.

Breadboard settings are saved in this browser. JSON and PNG still describe the schematic. The 3D renderer (three.js) loads only when you open the breadboard; without WebGL, the app shows a message instead. Unsupported circuits offer the two examples instead of an automatic layout.

## Simulation model

The schematic graph compiles to a two-terminal branch netlist. The UI-independent MNA solver uses scaled partial pivoting. It reports node voltages relative to GND, current from terminal A to B, and signed power (positive means absorbed). An ideal wire has zero voltage drop; its current is not shown if an ideal wire loop makes it indeterminate.

The simulator handles DC operating points with up to 200 branches. A potentiometer acts as a two-terminal rheostat, a bulb uses a resistive load with a visual power indicator, and diodes and LEDs use a piecewise-linear approximation. Fuses are evaluated per operating point rather than latched over time. Adding a capacitor enables backward Euler transient analysis at a fixed 20 ms time step. Open **RC Charging** to see a 1 s time constant and use the oscilloscope to probe a component’s terminal voltage. Reset returns capacitor voltages to 0 V. The model does not include inductors or AC sources.

The app uses React and Vite with [shadcn/ui's Base UI components](https://ui.shadcn.com/docs/installation/vite) for controls, a native SVG schematic, and three.js for the optional 3D breadboard.
