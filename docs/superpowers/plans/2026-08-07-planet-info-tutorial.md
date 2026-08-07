# Planet Info Panel & Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clickable-planet info card and a first-visit tutorial (welcome card + spotlight tour + hover tooltips) to the Three.js solar system model.

**Architecture:** Three new modules — `info-panel.ts` (facts card), `tutorial.ts` (welcome card, spotlight walkthrough, tooltips), plus raycasting wiring in `script.ts`. All DOM-based, zero new dependencies. Static markup lives in `index.html`, styles in two new SCSS files. Clicking a body raycasts the scene and reuses the existing `changeFocus` to fly the camera while opening the facts card.

**Tech Stack:** TypeScript, Three.js 0.153, Vite 4, SCSS. No test framework exists in this repo — verification gate is `tsc --noEmit` (added in Task 1) plus manual browser checks via Playwright screenshots + vision review.

**Note on TDD:** This repo has no test framework and the spec forbids new dependencies. Each task therefore uses typechecking + browser verification as its gate instead of unit tests.

---

## Task 1: Typecheck Infrastructure

The project has never been typechecked — `tsc` will surface pre-existing errors that must be fixed before any feature work.

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json`
- Modify: `src/setup/solar-system.ts:1`
- Modify: `src/setup/gui.ts:1,21`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "useDefineForClassFields": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Add typecheck script to `package.json`**

In the `scripts` block, add:

```json
    "typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Fix pre-existing type errors**

`solar-system.ts` uses `THREE.Scene` but never imports THREE — add at line 1:

```ts
import * as THREE from "three";
```

`gui.ts` uses `THREE.AmbientLight`/`THREE.Camera` without importing THREE, and `import * as dat from "lil-gui"` breaks under strict types — replace lines 1 and 21:

```ts
import GUI from "lil-gui";
```

```ts
  const gui = new GUI();
```

`planetary-object.ts` has `map: THREE.Texture;` assigned inside `loadTextures()` which TypeScript can't see — change line 61 to a definite-assignment assertion:

```ts
  map!: THREE.Texture;
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0, no output. If other strict-mode errors appear in existing files, fix them the same minimal way (add missing imports, use `!` where a method assigns fields).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json src/setup/solar-system.ts src/setup/gui.ts src/setup/planetary-object.ts
git commit -m "chore: add typecheck infra and fix pre-existing TS errors"
```

---

## Task 2: Temperature Data

**Files:**
- Modify: `src/planets.json` (all 16 bodies)
- Modify: `src/setup/planetary-object.ts:8-21` (Body interface)

- [ ] **Step 1: Add `temp` field to the `Body` interface**

In `src/setup/planetary-object.ts`, inside `export interface Body`, add after `tilt`:

```ts
  temp?: number;
```

- [ ] **Step 2: Add `temp` to every body in `src/planets.json`**

Add a `temp` line to each object (keep the surrounding fields as-is):

| Body | `"temp":` | Body | `"temp":` |
|---|---|---|---|
| Sun | 5500 | Uranus | -195 |
| Mercury | 167 | Neptune | -200 |
| Venus | 464 | Ganymede | -163 |
| Earth | 15 | Titan | -179 |
| Moon | -20 | Callisto | -139 |
| Mars | -63 | Io | -130 |
| Jupiter | -110 | Europa | -160 |
| Saturn | -140 | Triton | -235 |

Example — Mercury becomes:

```json
    "tilt": 0.03,
    "temp": 167,
    "traversable": true,
```

Do **not** add `temp` to "Rings of Saturn" — the panel must handle a missing value (tests the graceful `—` fallback).

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/planets.json src/setup/planetary-object.ts
git commit -m "feat: add surface temperature data to planets"
```

---

## Task 3: Info Panel

**Files:**
- Create: `src/setup/info-panel.ts`
- Modify: `src/index.html` (markup before `</body>`)
- Create: `src/styles/info-panel.scss`
- Modify: `src/style.scss:4` (import)

- [ ] **Step 1: Create `src/setup/info-panel.ts`**

```ts
import { Body } from "./planetary-object";

export class InfoPanel {
  private element: HTMLElement;
  private nameEl: HTMLElement;
  private radiusEl: HTMLElement;
  private dayEl: HTMLElement;
  private yearEl: HTMLElement;
  private tempEl: HTMLElement;
  isOpen = false;

  constructor() {
    this.element = document.getElementById("info-panel") as HTMLElement;
    this.nameEl = document.getElementById("info-name") as HTMLElement;
    this.radiusEl = document.getElementById("info-radius") as HTMLElement;
    this.dayEl = document.getElementById("info-day") as HTMLElement;
    this.yearEl = document.getElementById("info-year") as HTMLElement;
    this.tempEl = document.getElementById("info-temp") as HTMLElement;

    document
      .getElementById("btn-info-close")
      ?.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
  }

  open(body: Body) {
    this.nameEl.textContent = body.name;
    this.radiusEl.textContent = `${body.radius.toLocaleString()} km`;
    this.dayEl.textContent = `${Math.abs(body.daylength).toLocaleString()} hrs`;
    this.yearEl.textContent = `${Math.abs(body.period).toLocaleString()} days`;
    this.tempEl.textContent =
      body.temp !== undefined ? `${body.temp.toLocaleString()}°C` : "—";
    this.element.classList.add("visible");
    this.isOpen = true;
  }

  close() {
    this.element.classList.remove("visible");
    this.isOpen = false;
  }
}
```

- [ ] **Step 2: Add markup to `src/index.html`**

Before the `<script type="module" src="./script.ts"></script>` line, add:

```html
    <div id="info-panel">
      <div class="info-header">
        <h2 id="info-name">Earth</h2>
        <button id="btn-info-close" aria-label="Close">✕</button>
      </div>
      <div class="info-stats">
        <div class="info-row"><span>Radius</span><span id="info-radius"></span></div>
        <div class="info-row"><span>Day</span><span id="info-day"></span></div>
        <div class="info-row"><span>Year</span><span id="info-year"></span></div>
        <div class="info-row"><span>Temp</span><span id="info-temp"></span></div>
      </div>
    </div>
```

- [ ] **Step 3: Create `src/styles/info-panel.scss`**

```scss
#info-panel {
  position: fixed;
  left: 1.5rem;
  bottom: 1.5rem;
  z-index: 9;
  width: 230px;
  padding: 1rem 1.1rem;
  background: rgba(15, 15, 30, 0.75);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  color: white;
  font-family: "Trispace", sans-serif;
  opacity: 0;
  transform: translateY(16px);
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;

  &.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;

    h2 {
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 0.05em;
    }
  }

  #btn-info-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0 0.2rem;
    transition: color 0.15s ease;

    &:hover {
      color: white;
    }
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 200;
    padding: 0.25rem 0;

    span:first-child {
      color: rgba(255, 255, 255, 0.55);
    }
  }
}
```

- [ ] **Step 4: Import in `src/style.scss`**

Add after the `@use "./styles//loading-screen.scss";` line:

```scss
@use "./styles/info-panel.scss";
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/setup/info-panel.ts src/index.html src/styles/info-panel.scss src/style.scss
git commit -m "feat: add planet info panel component"
```

---

## Task 4: Click-to-Focus Raycasting

**Files:**
- Modify: `src/setup/planetary-object.ts:67-92` (constructor — tag mesh with body)
- Modify: `src/script.ts` (imports, raycast wiring)

- [ ] **Step 1: Tag each mesh with its data**

In `src/setup/planetary-object.ts` constructor, after `this.rng = ...` (line 77), add:

```ts
    this.mesh.userData.body = body;
```

- [ ] **Step 2: Add imports to `src/script.ts`**

After the `LAYERS` import (line 11), add:

```ts
import { InfoPanel } from "./setup/info-panel";
import { Tutorial } from "./setup/tutorial";
import { Body } from "./setup/planetary-object";
```

- [ ] **Step 3: Add the raycast helper + wiring to `src/script.ts`**

Add this module-level helper before the `// Canvas` section (after line 13):

```ts
const findClickedBody = (hits: THREE.Intersection[]): Body | null => {
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const body = object.userData.body as Body | undefined;
      if (body) return body;
      object = object.parent;
    }
  }
  return null;
};
```

Add this block right after the `bloomComposer.addPass(bloomPass);` line (line 123) — after `controls` and `changeFocus` are defined:

```ts
// Planet info panel
const infoPanel = new InfoPanel();

// Click a planet to focus it and view its facts
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = new THREE.Vector2();

canvas.addEventListener("pointerdown", (e) => {
  pointerDown.set(e.clientX, e.clientY);
});

canvas.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) return;
  pointer.x = (e.clientX / sizes.width) * 2 - 1;
  pointer.y = -(e.clientY / sizes.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const body = findClickedBody(hits);
  if (body) {
    changeFocus(options.focus, body.name);
    options.focus = body.name;
    infoPanel.open(body);
  } else {
    infoPanel.close();
  }
});
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/setup/planetary-object.ts src/script.ts
git commit -m "feat: click planet to focus camera and open info card"
```

---

## Task 5: Tutorial

**Files:**
- Create: `src/setup/tutorial.ts`
- Modify: `src/index.html` (help button, welcome card, spotlight overlay, tooltip element, `data-tooltip` attributes)
- Create: `src/styles/tutorial.scss`
- Modify: `src/style.scss` (import)
- Modify: `src/script.ts` (init Tutorial)

- [ ] **Step 1: Create `src/setup/tutorial.ts`**

```ts
const STORAGE_KEY = "solar-tutorial-seen";

interface TutorialStep {
  title: string;
  body: string;
  target?: string;
}

const STEPS: TutorialStep[] = [
  {
    title: "Travel between planets",
    body: "Use these arrows to hop between planets. The camera follows your selection.",
    target: "#btn-previous",
  },
  {
    title: "Look around",
    body: "Drag to orbit the view and scroll to zoom. The solar system is yours to explore.",
    target: "canvas.webgl",
  },
  {
    title: "Ambient light",
    body: "Toggles between bright day lighting and dimmed night lighting.",
    target: "#btn-ambient",
  },
  {
    title: "Points of interest",
    body: "Shows or hides the labelled features on planets, like Olympus Mons on Mars.",
    target: "#btn-labels",
  },
  {
    title: "Orbit paths",
    body: "Reveals the orbital path each planet travels along.",
    target: "#btn-paths",
  },
  {
    title: "Settings",
    body: "Opens the full control panel — simulation speed, moons, pause and more.",
    target: "#btn-settings",
  },
  {
    title: "Click a planet",
    body: "Click any planet to fly to it and open its facts card. Click empty space to close it.",
    target: "canvas.webgl",
  },
];

export class Tutorial {
  private welcome: HTMLElement;
  private spotlight: HTMLElement;
  private highlight: HTMLElement;
  private tooltipTitle: HTMLElement;
  private tooltipBody: HTMLElement;
  private counter: HTMLElement;
  private stepIndex = 0;
  private active = false;

  constructor() {
    this.welcome = document.getElementById("welcome-card") as HTMLElement;
    this.spotlight = document.getElementById("spotlight") as HTMLElement;
    this.highlight = document.getElementById(
      "spotlight-highlight"
    ) as HTMLElement;
    this.tooltipTitle = document.getElementById("spotlight-title") as HTMLElement;
    this.tooltipBody = document.getElementById("spotlight-body") as HTMLElement;
    this.counter = document.getElementById("spotlight-counter") as HTMLElement;

    document
      .getElementById("btn-help")
      ?.addEventListener("click", () => this.showWelcome());
    document
      .getElementById("btn-skip-welcome")
      ?.addEventListener("click", () => this.dismissWelcome());
    document
      .getElementById("btn-guide")
      ?.addEventListener("click", () => {
        this.dismissWelcome();
        this.startTour();
      });
    document
      .getElementById("btn-skip-tour")
      ?.addEventListener("click", () => this.endTour());
    document
      .getElementById("btn-next-step")
      ?.addEventListener("click", () => this.nextStep());
    window.addEventListener("resize", () => {
      if (this.active) this.positionHighlight();
    });
    this.initTooltips();
  }

  init() {
    if (!this.hasSeenTutorial()) {
      this.showWelcome();
    }
  }

  private hasSeenTutorial(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  private markSeen() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* private mode — fall back to showing every load */
    }
  }

  showWelcome() {
    this.welcome.classList.add("visible");
  }

  private dismissWelcome() {
    this.markSeen();
    this.welcome.classList.remove("visible");
  }

  private startTour() {
    this.active = true;
    this.stepIndex = 0;
    this.spotlight.classList.add("visible");
    this.renderStep();
  }

  private endTour() {
    this.active = false;
    this.markSeen();
    this.spotlight.classList.remove("visible");
  }

  private nextStep() {
    this.stepIndex++;
    if (this.stepIndex >= STEPS.length) {
      this.endTour();
      return;
    }
    this.renderStep();
  }

  private renderStep() {
    const step = STEPS[this.stepIndex];
    this.tooltipTitle.textContent = step.title;
    this.tooltipBody.textContent = step.body;
    this.counter.textContent = `${this.stepIndex + 1} / ${STEPS.length}`;
    this.positionHighlight(step.target);
  }

  private positionHighlight(target?: string) {
    const el = target ? document.querySelector<HTMLElement>(target) : null;
    if (!el) {
      this.highlight.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 10;
    this.highlight.style.display = "block";
    this.highlight.style.left = `${rect.left - pad}px`;
    this.highlight.style.top = `${rect.top - pad}px`;
    this.highlight.style.width = `${rect.width + pad * 2}px`;
    this.highlight.style.height = `${rect.height + pad * 2}px`;
  }

  private initTooltips() {
    const tooltip = document.getElementById("tooltip") as HTMLElement;
    document.querySelectorAll<HTMLElement>("[data-tooltip]").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        tooltip.textContent = el.dataset.tooltip ?? "";
        tooltip.style.display = "block";
        const rect = el.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top - 8}px`;
      });
      el.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });
    });
  }
}
```

- [ ] **Step 2: Add markup to `src/index.html`**

Add the "?" help button as the **first** child inside `.btn-group` (before `#btn-github`):

```html
      <button id="btn-help" aria-label="Help" data-tooltip="Help">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
          <g>
            <path style="fill:#0f0f1e" d="M12 24a12 12 0 1 1 12-12 12.013 12.013 0 0 1-12 12zm0-22a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2z" />
            <text x="12" y="16" text-anchor="middle" font-size="13" font-weight="bold" fill="#ffffff">?</text>
          </g>
        </svg>
      </button>
```

Add `data-tooltip` attributes to the existing buttons and links:

| Element | Attribute |
|---|---|
| `#btn-github` | `data-tooltip="Source code"` |
| `#btn-ambient` | `data-tooltip="Toggle ambient light"` |
| `#btn-labels` | `data-tooltip="Toggle labels"` |
| `#btn-paths` | `data-tooltip="Toggle orbit paths"` |
| `#btn-settings` | `data-tooltip="Open settings"` |
| `#btn-previous` | `data-tooltip="Previous planet"` |
| `#btn-next` | `data-tooltip="Next planet"` |

Add these blocks before the `<script type="module" src="./script.ts"></script>` line (after the `#info-panel` block):

```html
    <div id="welcome-card">
      <button id="btn-skip-welcome" class="skip">Skip</button>
      <h2>Welcome to the Solar System</h2>
      <p>
        Drag to look around, scroll to zoom. Take the quick tour to learn every
        feature — or skip it and explore freely.
      </p>
      <div class="welcome-actions">
        <button id="btn-guide">Quick guide</button>
      </div>
    </div>

    <div id="spotlight">
      <div id="spotlight-highlight"></div>
      <div id="spotlight-tooltip">
        <h3 id="spotlight-title"></h3>
        <p id="spotlight-body"></p>
      </div>
      <div id="spotlight-controls">
        <button id="btn-skip-tour">Skip</button>
        <span id="spotlight-counter"></span>
        <button id="btn-next-step">Next</button>
      </div>
    </div>

    <div id="tooltip"></div>
```

- [ ] **Step 3: Create `src/styles/tutorial.scss`**

```scss
#welcome-card {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  z-index: 12;
  width: min(420px, 90vw);
  padding: 1.75rem 1.5rem;
  background: rgba(15, 15, 30, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: white;
  font-family: "Trispace", sans-serif;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s ease;

  &.visible {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: auto;
  }

  h2 {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  p {
    margin-top: 0.75rem;
    font-size: 0.8rem;
    font-weight: 200;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.8);
  }

  .skip {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-family: inherit;
    font-size: 0.7rem;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: color 0.15s ease;

    &:hover {
      color: white;
    }
  }

  .welcome-actions {
    margin-top: 1.25rem;
  }

  #btn-guide {
    background: #ffc850;
    color: #111;
    border: none;
    padding: 0.6rem 1.5rem;
    border-radius: 8px;
    font-family: inherit;
    font-weight: 800;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s ease;

    &:hover {
      background: #ffd97a;
    }
  }
}

#spotlight {
  position: fixed;
  inset: 0;
  z-index: 11;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;

  &.visible {
    opacity: 1;
  }

  #spotlight-highlight {
    position: absolute;
    display: none;
    border: 2px solid #ffc850;
    border-radius: 10px;
    box-shadow: 0 0 24px rgba(255, 200, 80, 0.45);
    transition: left 0.25s ease, top 0.25s ease, width 0.25s ease,
      height 0.25s ease;
  }

  #spotlight-tooltip {
    position: absolute;
    bottom: 6rem;
    left: 50%;
    transform: translateX(-50%);
    width: min(360px, 85vw);
    padding: 0.9rem 1.1rem;
    background: rgba(15, 15, 30, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    color: white;
    font-family: "Trispace", sans-serif;
    text-align: center;

    h3 {
      font-size: 0.9rem;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    p {
      margin-top: 0.4rem;
      font-size: 0.75rem;
      font-weight: 200;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
    }
  }

  #spotlight-controls {
    position: absolute;
    bottom: 2.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 1rem;
    align-items: center;
    font-family: "Trispace", sans-serif;

    button {
      background: rgba(255, 255, 255, 0.08);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.45rem 1.2rem;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.18);
      }
    }

    #btn-next-step {
      background: #ffc850;
      color: #111;
      border: none;
      font-weight: 800;

      &:hover {
        background: #ffd97a;
      }
    }

    #spotlight-counter {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.7rem;
    }
  }
}

#tooltip {
  position: fixed;
  display: none;
  padding: 0.35rem 0.7rem;
  background: rgba(15, 15, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: white;
  font-family: "Trispace", sans-serif;
  font-size: 0.65rem;
  font-weight: 200;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-50%, -100%);
  z-index: 13;
}
```

- [ ] **Step 4: Import in `src/style.scss`**

Add after the `@use "./styles/info-panel.scss";` line:

```scss
@use "./styles/tutorial.scss";
```

- [ ] **Step 5: Init in `src/script.ts`**

In the click-wiring block added in Task 4, after `const infoPanel = new InfoPanel();`, add:

```ts
const tutorial = new Tutorial();
tutorial.init();
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/setup/tutorial.ts src/index.html src/styles/tutorial.scss src/style.scss src/script.ts
git commit -m "feat: add welcome card, spotlight tour and hover tooltips"
```

---

## Task 6: Browser Verification & Polish

**Files:** none expected (fix files only if issues found)

- [ ] **Step 1: Run dev server**

Run: `npm run dev -- --host` (background), confirm Vite ready message.

- [ ] **Step 2: First-load test (Playwright)**

Navigate to `http://localhost:5173/solar-system/` in a fresh browser context. Wait for the loading screen to dismiss (textures must load), then:
- Welcome card should be visible with Skip + Quick guide
- Screenshot → vision model review

- [ ] **Step 3: Tutorial flow test**

Click "Quick guide" → spotlight appears; verify each step's highlight box lands on the right element (prev arrows, canvas, ambient, labels, paths, settings, canvas); Next advances the counter; Skip exits.

- [ ] **Step 4: Info panel test**

Click the Earth in the 3D scene → camera should focus on Earth and card opens bottom-left with radius 3,959 km / day 24 hrs / year 365 days / temp 15°C. Test ✕, Escape, and click-empty-space all close it. Screenshot → vision model review.

- [ ] **Step 5: Persistence test**

Reload the page → welcome card must NOT reappear (localStorage flag). The "?" button must reopen it.

- [ ] **Step 6: Tooltip test**

Hover each top button → tooltip appears above it.

- [ ] **Step 7: Final commit if any fixes were made**

```bash
git add -A
git commit -m "fix: polish issues found during browser verification"
```
