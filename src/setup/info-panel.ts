import { Body } from "./planetary-object";

export class InfoPanel {
  private element: HTMLElement;
  private nameEl: HTMLElement;
  private radiusEl: HTMLElement;
  private dayEl: HTMLElement;
  private yearEl: HTMLElement;
  private tempEl: HTMLElement;
  private gravityEl: HTMLElement;
  private moonsEl: HTMLElement;
  private distanceEl: HTMLElement;
  private factEl: HTMLElement;
  isOpen = false;

  constructor() {
    this.element = document.getElementById("info-panel") as HTMLElement;
    this.nameEl = document.getElementById("info-name") as HTMLElement;
    this.radiusEl = document.getElementById("info-radius") as HTMLElement;
    this.dayEl = document.getElementById("info-day") as HTMLElement;
    this.yearEl = document.getElementById("info-year") as HTMLElement;
    this.tempEl = document.getElementById("info-temp") as HTMLElement;
    this.gravityEl = document.getElementById("info-gravity") as HTMLElement;
    this.moonsEl = document.getElementById("info-moons") as HTMLElement;
    this.distanceEl = document.getElementById("info-distance") as HTMLElement;
    this.factEl = document.getElementById("info-fact") as HTMLElement;

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
    this.gravityEl.textContent = body.gravity
      ? body.gravity.toLocaleString() + " m/s²"
      : "—";
    this.moonsEl.textContent = String(body.moons ?? "—");
    this.distanceEl.textContent =
      body.distanceAU !== undefined
        ? body.distanceAU.toLocaleString() + " AU"
        : "—";
    this.factEl.textContent = body.funFact ?? "";
    this.factEl.style.display = body.funFact ? "block" : "none";
    this.element.classList.add("visible");
    this.isOpen = true;
  }

  close() {
    this.element.classList.remove("visible");
    this.isOpen = false;
  }
}
