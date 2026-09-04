const STORAGE_KEY = "solar-tutorial-seen";

const COACH_STORAGE_KEY = "solar-coach-seen";

type CoachStep = "drag" | "hover" | "search" | "roam" | "settings";

const COACH_STEPS: CoachStep[] = ["drag", "hover", "search", "roam", "settings"];

type CoachSeen = Record<CoachStep, boolean>;

const readCoachSeen = (): CoachSeen => {
  const fallback = Object.fromEntries(
    COACH_STEPS.map((step) => [step, false])
  ) as CoachSeen;
  try {
    const raw = localStorage.getItem(COACH_STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<CoachSeen>) };
  } catch {
    return fallback;
  }
};

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
    body: "Toggles the fill light between bright day lighting and dimmed night lighting. Fine-tune it with the Ambient Intensity slider in Settings.",
    target: "#btn-ambient",
  },
  {
    title: "Points of interest",
    body: "Shows or hides the labelled features on planets, like Olympus Mons on Mars.",
    target: "#btn-labels",
  },
  {
    title: "Planet orbit rings",
    body: "Reveals the orbit ring each planet and dwarf planet travels along around the Sun.",
    target: "#btn-planet-paths",
  },
  {
    title: "Moon orbit rings",
    body: "A separate toggle for the moons' orbit rings around their host planets.",
    target: "#btn-moon-paths",
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
  {
    title: "Free roam",
    body: "The Free Roam button starts first-person flight — WASD to move, click the view to capture the pointer for continuous look, Space/C to rise and sink, Shift to boost, scroll for speed. Esc releases the pointer; Esc again exits and the camera holds its pose.",
    target: "#btn-fps",
  },
  {
    title: "Controls & features",
    body: "The help button opens a full reference explaining every toolbar button and simulation control.",
    target: "#btn-help",
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
  private coachEl: HTMLElement | null = null;
  private coachTimer = 0;
  private coachRemainingMs = 8000;
  private coachShownAt = 0;

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
      .getElementById("btn-skip-welcome")
      ?.addEventListener("click", () => this.dismissWelcome());
    document
      .getElementById("btn-guide")
      ?.addEventListener("click", () => {
        this.dismissWelcome();
        this.startTour();
      });
    // Welcome-card button: close the card, mark the tour seen, then open
    // the help reference. HelpPanel already toggles on #btn-guide2, so only
    // fall back to #btn-help when the panel is still closed afterwards.
    document
      .getElementById("btn-guide2")
      ?.addEventListener("click", () => {
        this.dismissWelcome();
        window.setTimeout(() => {
          const panel = document.getElementById("help-panel");
          if (panel && !panel.classList.contains("visible")) {
            document.getElementById("btn-help")?.click();
          }
        }, 0);
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
    // First visit: no welcome wall. Show one ambient coach chip instead;
    // the guided tour stays launchable from the help panel.
    if (!readCoachSeen().drag) {
      this.showCoachMark();
    }
  }

  private showCoachMark() {
    if (this.coachEl) return;
    const el = document.createElement("div");
    el.className = "coach-mark";
    el.textContent = "Drag the sky to look around.";
    el.setAttribute("role", "status");
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "2rem";
    el.style.transform = "translateX(-50%)";
    el.style.maxWidth = "calc(100vw - 8rem)";
    el.style.zIndex = "60";
    el.style.cursor = "pointer";
    el.addEventListener("click", () => this.dismissCoachMark());
    el.addEventListener("mouseenter", () => this.pauseCoachTimer());
    el.addEventListener("mouseleave", () => this.resumeCoachTimer());
    // The chip teaches one gesture — retire it the moment the user performs
    // it (first real canvas drag), not just on timeout/click.
    window.addEventListener("pointerdown", this.dismissOnCanvasDrag, true);
    this.coachEl = el;
    this.coachRemainingMs = 8000;
    this.resumeCoachTimer();
  }

  private pauseCoachTimer() {
    if (!this.coachTimer) return;
    window.clearTimeout(this.coachTimer);
    this.coachTimer = 0;
    this.coachRemainingMs = Math.max(
      0,
      this.coachRemainingMs - (performance.now() - this.coachShownAt)
    );
  }

  private resumeCoachTimer() {
    if (!this.coachEl || this.coachTimer) return;
    this.coachShownAt = performance.now();
    this.coachTimer = window.setTimeout(
      () => this.dismissCoachMark(),
      this.coachRemainingMs
    );
  }

  private dismissOnCanvasDrag = (e: PointerEvent): void => {
    if (!this.coachEl) return;
    if ((e.target as HTMLElement | null)?.closest("canvas.webgl")) {
      this.dismissCoachMark();
    }
  };

  private dismissCoachMark() {
    if (this.coachTimer) {
      window.clearTimeout(this.coachTimer);
      this.coachTimer = 0;
    }
    window.removeEventListener("pointerdown", this.dismissOnCanvasDrag, true);
    try {
      localStorage.setItem(
        COACH_STORAGE_KEY,
        JSON.stringify({ ...readCoachSeen(), drag: true })
      );
    } catch {
      /* private mode — fall back to showing every load */
    }
    this.coachEl?.remove();
    this.coachEl = null;
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
    this.dismissCoachMark();
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
        // Redundant while the tool rail is expanded (names are visible).
        if (el.closest(".toolbar")?.classList.contains("expanded")) return;
        tooltip.style.display = "block";
        const rect = el.getBoundingClientRect();
        if (el.closest(".toolbar")) {
          // Tool-rail buttons: open to the right, vertically centred.
          tooltip.classList.add("tooltip-right");
          tooltip.style.left = `${rect.right + 10}px`;
          tooltip.style.top = `${rect.top + rect.height / 2}px`;
        } else {
          tooltip.classList.remove("tooltip-right");
          // Prefer ABOVE the control; flip below when there is no room
          // (top-edge controls would push the tooltip off-screen).
          const roomAbove = rect.top > 60;
          tooltip.style.left = `${rect.left + rect.width / 2}px`;
          tooltip.style.top = roomAbove ? `${rect.top - 8}px` : `${rect.bottom + 8}px`;
        }
      });
      el.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
        tooltip.classList.remove("tooltip-right");
      });
    });
  }
}
