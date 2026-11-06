# Wire

**Draw it. Connect it. See it work.**

A browser-only circuit sandbox by **Transnology**, designed for Year 9 science.
Draw conventional circuit diagrams and see the same electrical graph become a
physical experiment on a wooden workbench. No accounts, backend, cloud database,
remote 3D assets, or AI services.

## Run locally

Use Node **24 LTS** (`.nvmrc`), or Node 22.12+.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`.

```sh
npm test                         # circuit, state, storage, layout and export tests
npm run build                    # strict TypeScript check + static production build
npx playwright install chromium # once, for browser tests
npm run test:e2e                  # real Chromium editor interactions
npm run format:check
npm run preview                  # serve the production build locally
```

`npm run test:e2e` starts Vite automatically if a server is not already running.
The GitHub Actions workflow runs formatting, unit tests, the production build, and
browser tests on pull requests and pushes to `main`. It does not deploy anything.

## Try it

The app opens with a working **cell → switch → lamp** circuit. The lamp's power is
calculated immediately. Open **Try an example** for a blank canvas, two lamps in
series, or two lamps in parallel.

1. Drag a component from the library onto the grid, or click its library button.
2. Click a terminal, then another terminal to connect them. You can also drag
   between terminals. Both ends of a cell and a lamp need connections.
3. While drawing a wire, click empty space to place corners. Double-click to leave
   a disconnected endpoint. Escape cancels the preview.
4. Double-click a switch in 2D, click its physical body or label in 3D, or toggle
   its inspector control. The schematic and physical scene use the same state.
5. Select a component to edit its values and see its simulated voltage, current,
   power, and lamp brightness.

**Branches:** in wire mode, click an existing wire to create a connected junction
and start or finish a branch. In select mode, double-click a wire to add a junction.
A visible dot means an explicit connection. Plain wire crossings never connect.

**Editing:** select a wire to expose its endpoint and corner handles. Drag an
endpoint to reconnect it; drag a corner to reshape it. Moving or rotating a part
reroutes its wires to the new terminal positions. Shift-click adds to selection;
drag an empty area to select several components. Right-click a part or wire for
selection actions. Copying a complete parallel circuit preserves its junctions.

**Camera:** orbit, zoom and pan the experiment with the mouse or touch controls.
Reset and fit buttons restore a useful view. The camera stays above the tabletop.
Use 3D mode for a full-workspace experiment. On small screens, 2D and 3D are shown
one at a time; the component library and inspector open as panels.

### Keyboard

| Key | Action |
| --- | --- |
| V / W | Select / wire tool |
| / | Search the component library |
| R | Rotate selection 90° |
| Delete / Backspace | Delete selection |
| Cmd/Ctrl Z | Undo |
| Cmd/Ctrl Shift Z | Redo |
| Cmd/Ctrl S | Save locally |
| Cmd/Ctrl C / V | Copy / paste |
| Cmd/Ctrl A | Select all components |
| Escape | Cancel wire / clear selection |
| F | Fit both views |
| Alt + drag | Pan schematic |
| Scroll | Zoom schematic around pointer |
| Tab, Enter | Focus and activate controls, including component terminals |
| Arrow keys on a component | Move it by one grid step |

Shortcuts do not capture typing in text fields. Focused switches toggle with Enter
or Space. Focus a terminal and press Enter, then do the same on a destination
terminal to wire using the keyboard. Push buttons connect while held in their
inspector. The app respects reduced-motion preferences and offers light, dark,
and system themes. It keeps the 2D editor and solver usable if WebGL fails.

## Electrical models

The engine uses **DC modified nodal analysis**, with explicit graph connectivity,
pivoted Gaussian elimination, and an active-set piecewise-linear LED model.
Wires merge explicit endpoint nodes using union-find. Geometric overlap plays
no part in the connectivity calculation. Each isolated electrical island has its
own voltage reference; there is no implicit common ground between islands.

| Component | Supported model |
| --- | --- |
| Cell / battery | Editable DC source, 0.1 Ω internal series resistance; defaults 1.5 V / 4.5 V. Supports series sources and multiple sources in a graph. |
| Lamp | Constant R = rated V² / rated P. Defaults 1.5 V, 0.3 W → 7.5 Ω. Brightness is P / rated P, capped for rendering. Warns above 130% of rating. |
| Switch / push button | Open: branch omitted. Closed: 0.01 Ω. |
| Fixed / variable resistor | Linear, editable resistance. Variable resistor also has a 10–1,000 Ω slider. |
| LED | Forward voltage (default 2 V) plus 10 Ω dynamic resistance. Reverse/off conductance 1e−10 S. Brightness rises to 20 mA. External series resistor is required to limit current. Warns above 30 mA and for reverse polarity. |
| Motor | Editable resistor, default 12 Ω. Fan direction follows signed branch current; speed scales with current and is capped. |
| Buzzer | Editable resistor, default 100 Ω. Activates above 1 V and 5 mA. A quiet 440 Hz tone plays only after audio is enabled in Settings. |
| Ammeter | 0.01 Ω shunt; measures signed branch current, displayed as magnitude. Insert in series. |
| Voltmeter | 1 GΩ input resistance; measures terminal potential difference. Connect in parallel. |

All UI measurements are finite solver outputs; failed calculations show an
explanation instead of fabricated measurements. LED active-set non-convergence
is reported. Invalid parameters, unconnected terminals, reversed LEDs, excessive
LED current, lamp overload and source shorts are explained. A source with merged
terminals or current above 5 A is flagged as a short/excessive-current condition.
The status bar displays the sum of source-current magnitudes (not the current in
a particular branch when multiple sources are present). The 5 A threshold is an educational warning threshold, not a device protection
rating. Ordinary open and unfinished circuits are normal editing states.

### Manually checked reference results

These include source and closed-switch resistance:

| Circuit | Expected result |
| --- | --- |
| 1.5 V cell + closed switch + 7.5 Ω lamp | I = 1.5 / (0.1 + 0.01 + 7.5) = 0.197109 A |
| Two identical lamps in series | I = 1.5 / 15.11 = 0.099272 A; each receives less power |
| Two identical lamps in parallel | Total I = 1.5 / 3.86 = 0.388601 A; 0.194301 A per lamp |
| 3 V source + 2 V LED + 100 Ω resistor | I = (3 − 2) / (0.1 + 10 + 100) = 9.08265 mA |
| Direct short across a 1.5 V cell | I = 1.5 / 0.1 = 15 A; flagged as a short |

**Deliberate simplifications:** filament resistance does not change with
temperature. No AC, capacitance, inductance, switching transients, thermal damage,
real motor back-EMF, torque or startup dynamics are simulated. LEDs do not model
reverse breakdown or failure. Sources do not deplete. Brightness and fan motion
are illustrative responses to the stated models, not photometric or mechanical
predictions. Physical battery holders and other equipment are procedural visual
representations, not calibrated hardware models.

## Local projects and exports

- **Save** writes a named project to IndexedDB. **Open** lists recent local projects
  and supports duplication, deletion, and importing `.wire.json` files.
- Click the project title to rename and save, or **Save as copy**.
- Changes autosave to a recovery record after 800 ms of inactivity. Recovery is
  separate from named saves. Audio is always off after loading or recovery.
- Work is stored **per browser and origin**. Clearing site data removes it. Moving
  from localhost to the public domain does not migrate the browser's storage.
  Export a project file for backups or transfers between devices or origins.
- Version 1 project files contain components, positions, orientation, electrical
  values, explicit wires, corners, junctions, name, view and settings. Unknown
  versions and corrupt files are rejected; a damaged stored project does not
  prevent other valid named projects from opening.
- **SVG / PNG:** clean diagrams, with no editing handles, optional transparent
  background and project title. PNGs normally use 2× resolution, bounded to
  16 megapixels and 8,192 pixels per axis for very large diagrams.
- **3D PNG:** captures the actual WebGL canvas at the current camera angle.
  Interface labels and controls are excluded; physical meter displays are
  rendered into the canvas and included. Open a visible 3D view first.
- No watermark is added.

This is a small educational editor, bounded to **200 components and 600 wires**.
Routing is a predictable orthogonal elbow router with manual corners. It does
not attempt professional CAD obstacle routing. The 3D scene uses a deterministic
layout, keeps existing equipment stationary during unrelated edits, separates
nearby physical equipment, and attaches flexible tube cables to the same terminal
IDs. Cable crossings may still occur in complex layouts. Current-flow particles,
manual 3D rearrangement and a physically accurate wire-tangle solver are omitted.

## Code map

```text
src/
  core/types.ts          Circuit/project format, library defaults, geometry
  core/store.ts          Authoritative state, editing, selection, undo/redo
  core/solver.ts         Connectivity and modified nodal analysis
  core/persistence.ts    IndexedDB, recovery, project validation
  core/export.tsx        Standalone SVG, PNG and WebGL downloads (lazy-loaded)
  editor/Editor.tsx      SVG editor, terminals, wires, gestures and camera
  editor/Symbol.tsx      Conventional schematic symbols
  scene/layout.ts       Stable physical layout and terminal mapping
  scene/Experiment.tsx  Canvas, flexible cables, lighting, orbit controls, audio
  scene/Models.tsx      Reusable procedural classroom equipment
  scene/Wood.tsx        Locally generated wooden-table texture
  ui/                   Inspector, accessible modal, React Bits entrance motion
  App.tsx               Workspace, project actions, settings and help
  styles.css            Responsive themes and interface styling
```

React 19, TypeScript, Vite, Tailwind CSS, Lucide, Zustand, Three.js, React Three
Fiber, Drei, GSAP and idb. React Bits AnimatedContent is adapted for short panel
entrances; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The editor, exports
and 3D scene are separated; the heavy 3D and SVG-export code are loaded lazily.
The 3D renderer rests when the scene is idle and requests frames for camera
changes and active animations. Vite reports the expected large 3D chunk (Three.js and the renderer). No external
font, model or texture download is required at runtime.

Tests cover nodal analysis, current/voltage/power references, parallel and series
branches, open/closed switches, LEDs and polarity, meters, shorts, invalid models,
explicit junction connectivity, grid snapping, editing and history, branch
copy/paste, physical-layout stability, IndexedDB, project validation and clean SVG.
Playwright exercises actual placement, dragging, terminal wiring, physical and
schematic switching, keyboard input, junctions, local recovery, downloads, themes
and a narrow viewport.

## Deploy yourself to Vercel

This repository is a static Vite application. No server, secrets, environment
variables or provisioned services are needed.

1. Push this repository to GitHub yourself.
2. Import the repository into your Vercel account.
3. Choose the **Vite** framework preset, repository root as the root directory,
   **`npm run build`** as the build command, and **`dist`** as the output directory.
4. Use Node **24.x** for the build, then deploy. The included lockfile keeps
   dependency installs reproducible.
5. In your Vercel project's domain settings, add **`wire.lachie.wtf`**. Vercel will
   display the DNS record required for the existing DNS provider. Apply that
   exact record through your provider, then wait for verification and HTTPS.
   Do not copy a guessed IP address or replace unrelated DNS records.

There are no client-side pathname routes requiring fallback rewrites. Test the
preview URL, save/reload a circuit, export a diagram, and try WebGL on your target
school devices before assigning the custom domain.

**No GitHub push, production deployment or DNS changes are performed by this
project's setup scripts or CI.** Publishing is the owner's action.
