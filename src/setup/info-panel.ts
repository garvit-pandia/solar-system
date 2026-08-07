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
