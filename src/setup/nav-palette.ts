/**
 * Search & quick-nav palette (P0 #1).
 *
 * Ctrl/Cmd+K (or the toolbar magnifier button) opens a fuzzy-search palette
 * over every body in the solar system. Type to filter (subsequence fuzzy
 * match with word/prefix bonuses), arrows + Enter to fly, Esc to close.
 * The number keys 1–9/0 jump straight to the ten classic bodies in the
 * same order as the prev/next buttons.
 */
export interface PaletteBody {
  name: string;
  type: string;
  category?: string;
}

export interface NavPaletteOptions {
  bodies: PaletteBody[];
  /** Order for the 1–9/0 number-key shortcuts (the traversable bodies). */
  shortcuts: string[];
  onSelect: (name: string) => void;
}

const MAX_RESULTS = 12;

/** Subsequence fuzzy match with scoring; returns score or null. */
const fuzzyMatch = (query: string, name: string): number | null => {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -2;
  for (let ni = 0; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) {
      if (ni === 0 && qi === 0) score += 5; // exact prefix
      if (ni === lastMatch + 1) score += 3; // consecutive run
      else score += 1; // gap (no bonus)
      if (ni === 0 || /[\s'\-]/.test(n[ni - 1])) score += 2; // word start
      lastMatch = ni;
      qi++;
    }
  }
  return qi === q.length ? score : null;
};

/** Wrap matched characters in <mark> for the result rows. */
const highlight = (name: string, query: string): string => {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let out = "";
  let qi = 0;
  let ni = 0;
  for (; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) {
      out += `<mark>${name[ni]}</mark>`;
      qi++;
    } else {
      out += name[ni];
    }
  }
  return out + name.slice(ni);
};

export class NavPalette {
  isOpen = false;

  private element: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private bodies: PaletteBody[];
  private shortcuts: string[];
  private onSelect: (name: string) => void;
  private selectedIndex = 0;
  private lastFocused: HTMLElement | null = null;
  private lastQuery = "";

  constructor(options: NavPaletteOptions) {
    this.bodies = options.bodies;
    this.shortcuts = options.shortcuts;
    this.onSelect = options.onSelect;

    this.element = document.getElementById("nav-palette") as HTMLElement;
    this.input = document.getElementById("palette-input") as HTMLInputElement;
    this.results = document.getElementById("palette-results") as HTMLElement;

    document
      .getElementById("btn-search")
      ?.addEventListener("click", () => this.toggle());

    this.input.addEventListener("input", () => {
      this.selectedIndex = 0;
      this.render();
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.moveSelection(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.moveSelection(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.activate(this.selectedIndex);
      }
    });

    this.results.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest(
        ".palette-item"
      ) as HTMLElement | null;
      if (item?.dataset.name) {
        this.onSelect(item.dataset.name);
        this.close();
      }
    });

    // Click on the dimmed backdrop closes the palette.
    this.element.addEventListener("pointerdown", (e) => {
      if (e.target === this.element) this.close();
    });

    // Global keys: Ctrl/Cmd+K toggle, digits jump to classic bodies.
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        this.toggle();
        return;
      }
      // Digits are only shortcuts when not typing in a field.
      if (this.isOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "9") {
        this.jump(Number(e.key) - 1);
      } else if (e.key === "0") {
        this.jump(9);
      }
    });
  }

  toggle = (): void => {
    this.isOpen ? this.close() : this.open();
  };

  open = (): void => {
    if (this.isOpen) return;
    this.isOpen = true;
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.element.hidden = false;
    this.element.classList.add("visible");
    this.input.value = "";
    this.selectedIndex = 0;
    this.render();
    this.input.focus();
  };

  close = (): void => {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.element.classList.remove("visible");
    this.element.hidden = true;
    this.input.blur();
    this.lastFocused?.focus?.();
  };

  private jump = (index: number): void => {
    const name = this.shortcuts[index];
    if (!name) return;
    this.onSelect(name);
  };

  private moveSelection = (delta: number): void => {
    const count = this.results.children.length;
    if (count === 0) return;
    this.selectedIndex =
      (this.selectedIndex + delta + count) % count;
    this.render();
  };

  private activate = (index: number): void => {
    const item = this.results.children[index] as HTMLElement | null;
    if (item?.dataset.name) {
      this.onSelect(item.dataset.name);
      this.close();
    }
  };

  private render = (): void => {
    const query = this.input.value;
    const rerenderAll = query !== this.lastQuery;
    this.lastQuery = query;

    const matches = this.bodies
      .map((body) => ({ body, score: fuzzyMatch(query, body.name) }))
      .filter((m): m is { body: PaletteBody; score: number } => m.score !== null)
      .sort((a, b) => b.score - a.score || a.body.name.localeCompare(b.body.name))
      .slice(0, MAX_RESULTS);

    if (rerenderAll) {
      this.results.innerHTML = "";
      for (const { body } of matches) {
        const item = document.createElement("li");
        item.className = "palette-item";
        item.dataset.name = body.name;
        const label = document.createElement("span");
        label.className = "palette-name";
        label.innerHTML = highlight(body.name, query);
        const badge = document.createElement("span");
        badge.className = "palette-badge";
        badge.textContent = body.category ?? body.type;
        item.append(label, badge);
        this.results.appendChild(item);
      }
    }

    const items = this.results.children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle("selected", i === this.selectedIndex);
    }
    const selected = items[this.selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  };
}
