// List of prompts to display whilst loading textures.
const loadingPrompts = [
  "Detecting neutrinos",
  "Forming event horizons",
  "Annihilating particles",
  "Tunneling electrons",
  "Entangling photons",
  "Collapsing wavefunctions",
  "Quantising gravity",
  "Evaporating black holes",
  "Increasing entropy",
];

// Switch loading screen text every 2 seconds.
const switchLoadText = setInterval(() => {
  const index = Math.floor(Math.random() * loadingPrompts.length);
  const loadText = document.getElementById("loader-text") as HTMLDivElement;
  loadText.textContent = `${loadingPrompts[index]}...`;
}, 2000);

let loaded = false;

const armLoadFallback = () => {
  window.setTimeout(() => {
    // Textures hung and onLoaded never ran: dismiss the loader anyway.
    if (loaded) return;
    const pending = document.getElementById("loading") as HTMLDivElement | null;
    if (!pending || pending.style.display === "none") return;
    if (pending.style.pointerEvents === "none") return;
    clearInterval(switchLoadText);
    pending.style.pointerEvents = "none";
    window.dispatchEvent(new CustomEvent("loading-dismissed"));
    pending.style.display = "none";
  }, 30_000);
};

if (document.readyState === "complete") {
  armLoadFallback();
} else {
  window.addEventListener("load", armLoadFallback, { once: true });
}

/**
 * Updates the loading screen once textures are loaded.
 */
export const onLoaded = () => {
  clearInterval(switchLoadText);
  const loadText = document.getElementById("loader-text") as HTMLDivElement;
  loadText.textContent = "Enter the system";

  const loadIcon = document.getElementById("loader-circle") as HTMLDivElement;
  const svg = loadIcon.children[0] as HTMLElement;
  svg.style.animation = "none";

  const loadContainer = document.getElementById("loading") as HTMLDivElement;
  loadContainer.style.cursor = "pointer";

  // Guard against re-entry: animation.onfinish and a second click could
  // otherwise fire "loading-dismissed" twice and double-dispatch the event.
  let dismissed = false;
  loaded = true;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    loadContainer.style.pointerEvents = "none";
    window.dispatchEvent(new CustomEvent("loading-dismissed"));
    const animation = loadContainer.animate(
      { opacity: [1, 0], transform: ["scale(1)", "scale(0.75)"] },
      {
        duration: 750,
        easing: "ease",
        fill: "forwards",
      }
    );

    animation.onfinish = () => {
      loadContainer.style.display = "none";
    };
  };
  loadContainer.addEventListener("click", dismiss, { once: true });
  loadContainer.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    dismiss();
  });
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (dismissed || loadContainer.style.display === "none") return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    dismiss();
  });
  loadContainer.setAttribute("tabindex", "0");
  try {
    loadContainer.focus({ preventScroll: true });
  } catch {
    /* focus is best-effort — the window key handler still dismisses */
  }
};
