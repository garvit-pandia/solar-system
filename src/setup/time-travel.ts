import { simDateMsFromElapsed, elapsedFromSimDateMs } from "./ephemeris";
import { showToast } from "./cinematic";

interface TimeTravelOptions {
  /** Current sim clock, in elapsed-time units. */
  getElapsed: () => number;
  /** Write the sim clock (also clears motion trails — the timeline jumped). */
  setElapsed: (elapsed: number) => void;
}

/** The JPL element table's validated interval (approx_pos.html, Table 1). */
const MIN_YEAR = 1800;
const MAX_YEAR = 2050;

const pad = (n: number): string => String(n).padStart(2, "0");

/** datetime-local wants "YYYY-MM-DDTHH:mm" — built from UTC components so
 * the picker speaks the same UTC clock as the HUD. */
const toInputValue = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/**
 * Date travel for the simulation. Clicking the sim-date chip opens a glass
 * popover with a UTC datetime picker: "Go" jumps the sim clock to that
 * instant (planets re-solve their Keplerian positions on the next tick),
 * "Now" snaps back to the real present. Valid range 1800–2050 — the
 * interval the JPL element table is accurate for.
 */
export class TimeTravel {
  private readonly getElapsed: () => number;
  private readonly setElapsed: (elapsed: number) => void;

  constructor(options: TimeTravelOptions) {
    this.getElapsed = options.getElapsed;
    this.setElapsed = options.setElapsed;

    document
      .getElementById("sim-date")
      ?.addEventListener("click", this.togglePopover);
    document.getElementById("btn-date-go")?.addEventListener("click", this.go);
    document.getElementById("btn-date-now")?.addEventListener("click", this.now);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.close();
    });
    // Click outside the popover closes it (the chip toggles itself).
    document.addEventListener("pointerdown", (e) => {
      const popover = this.popover;
      if (!popover || popover.hidden) return;
      const target = e.target as Node;
      if (
        !popover.contains(target) &&
        !document.getElementById("sim-date")?.contains(target)
      ) {
        this.close();
      }
    });
  }

  private get popover(): HTMLElement | null {
    return document.getElementById("date-popover");
  }

  private get input(): HTMLInputElement | null {
    return document.getElementById("date-input") as HTMLInputElement | null;
  }

  togglePopover = (): void => {
    const popover = this.popover;
    if (!popover) return;
    if (popover.hidden) this.open();
    else this.close();
  };

  open = (): void => {
    const popover = this.popover;
    const input = this.input;
    if (!popover || !input) return;
    popover.hidden = false;
    input.value = toInputValue(simDateMsFromElapsed(this.getElapsed()));
    input.focus();
  };

  close = (): void => {
    const popover = this.popover;
    if (popover) popover.hidden = true;
  };

  /** Jump to the real present (the sim's home instant). */
  now = (): void => {
    this.setElapsed(elapsedFromSimDateMs(Date.now()));
    if (this.input) this.input.value = toInputValue(Date.now());
    showToast("Jumped to now");
  };

  /** Jump to the picked date, interpreted as UTC. */
  go = (): void => {
    const input = this.input;
    if (!input || !input.value) return;
    // datetime-local yields "YYYY-MM-DDTHH:mm" — treat it as UTC by
    // appending seconds + Z (the whole app runs on the UTC clock).
    const ms = Date.parse(`${input.value}:00Z`);
    if (Number.isNaN(ms)) {
      showToast("Invalid date");
      return;
    }
    const year = new Date(ms).getUTCFullYear();
    if (year < MIN_YEAR || year > MAX_YEAR) {
      showToast(`Valid range ${MIN_YEAR}–${MAX_YEAR}`);
      return;
    }
    this.setElapsed(elapsedFromSimDateMs(ms));
    showToast(`Sim date → ${input.value.replace("T", " ")} UTC`);
    this.close();
  };
}
