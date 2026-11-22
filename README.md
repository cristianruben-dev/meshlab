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

## Breadboard view

Choose **Breadboard** on the canvas, then open **Voltage Divider** or **LED + Switch**. In **Assembled**, select a socket to highlight its conductive strip and read its voltage to ground. In **Guided build**, choose the numbered sockets and check each step; the virtual probe becomes available when the physical connections match the schematic.

The 2D model has 20 columns, two separate five-socket strips per column, and four independent continuous power rails. Some real boards have split rails; [check your hardware for continuity](https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard/) before using the reference layout. Breadboard placement is session-local; JSON and PNG still describe the schematic. Unsupported circuit topologies offer the two guided examples instead of an automatic layout.

## Simulation model

The schematic graph compiles to a two-terminal branch netlist. The UI-independent MNA solver uses scaled partial pivoting. It reports node voltages relative to GND, current from terminal A to B, and signed power (positive means absorbed). An ideal wire has zero voltage drop; its current is not shown if an ideal wire loop makes it indeterminate.

The simulator handles DC operating points with up to 200 branches. A potentiometer acts as a two-terminal rheostat, a bulb uses a resistive load with a visual power indicator, and diodes and LEDs use a piecewise-linear approximation. Fuses are evaluated per operating point rather than latched over time. Adding a capacitor enables backward Euler transient analysis at a fixed 20 ms time step. Open **RC Charging** to see a 1 s time constant and use the oscilloscope to probe a component’s terminal voltage. Reset returns capacitor voltages to 0 V. The model does not include inductors or AC sources.

The app uses React and Vite with [shadcn/ui's Base UI components](https://ui.shadcn.com/docs/installation/vite) for controls, and a native SVG schematic.
