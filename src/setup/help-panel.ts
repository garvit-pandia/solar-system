/**
 * Help panel — a reference for every feature and simulation control.
 *
 * Opened from the help button and the welcome card. Contains static
 * sections (camera, time, display, modes) plus a link to the guided tour
 * and the project's GitHub page.
 */
export class HelpPanel {
  private panel: HTMLElement;

  constructor() {
    this.panel = document.getElementById("help-panel") as HTMLElement;

    document
      .getElementById("btn-help")
      ?.addEventListener("click", () => this.toggle());
    document
      .getElementById("btn-help-close")
      ?.addEventListener("click", () => this.close());
    // Welcome-card button: open this reference.
    document
      .getElementById("btn-guide2")
      ?.addEventListener("click", () => this.toggle());
    // Help-panel button: close the reference and start the spotlight tour.
    document
      .getElementById("btn-help-tour")
      ?.addEventListener("click", () => {
        this.close();
        document.getElementById("btn-guide")?.click();
      });
    // Clicking the backdrop (not the card) closes the panel.
    this.panel.addEventListener("click", (e) => {
      if (e.target === this.panel) this.close();
    });
  }

  toggle = (): void => {
    this.panel.classList.toggle("visible");
  };

  close = (): void => {
    this.panel.classList.remove("visible");
  };

  isOpen = (): boolean => {
    return this.panel.classList.contains("visible");
  };
}
