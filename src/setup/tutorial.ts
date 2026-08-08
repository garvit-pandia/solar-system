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
    body: "Toggles the fill light between bright day lighting and dimmed night lighting. This is the only ambient control.",
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
    body: "The Free Roam button starts first-person flight — WASD to move, mouse to look, Space/C to rise and dive, Shift to boost. Press Esc to return to orbit; your position is remembered for next time.",
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
