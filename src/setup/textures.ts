import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader";
import { onLoaded } from "./loading";
import { KTX2_AVAILABLE } from "./texture-manifest";

let textureCount = 0;
let texturesDone = 0;
const textureLoader = new THREE.TextureLoader();
let ktx2Loader: KTX2Loader | null = null;

/** Progress counts successes AND failures — one 404 must never wedge the
 *  loading screen on "Loading..." forever. */
const registerSettled = (): void => {
  texturesDone++;

  const percentageContainer = document.getElementById(
    "loader-percentage"
  ) as HTMLElement;
  percentageContainer.textContent = getProgress();

  if (texturesDone === textureCount) {
    onLoaded();
  }
};

/**
 * Enable the KTX2 path. Must be called after the renderer exists (the Basis
 * transcoder support probe needs the GL context) and before any body is
 * constructed. Textures whose conversion did not shrink them stay on JPG
 * (see scripts/build-textures-ktx2.mjs → texture-manifest.ts).
 */
export const enableKTX2 = (renderer: THREE.WebGLRenderer): void => {
  try {
    const base =
      (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    ktx2Loader = new KTX2Loader()
      .setTranscoderPath(`${base}basis/`)
      .detectSupport(renderer);
  } catch {
    ktx2Loader = null; // transcoder unavailable — JPG path serves everything
  }
};

export const loadTexture = (path: string): THREE.Texture => {
  if (ktx2Loader) {
    const base = path.split("/").pop()!.replace(/\.jpg$/i, "");
    if (KTX2_AVAILABLE.has(base)) {
      // GPU-compressed ETC1S: ~4 bpp in VRAM instead of the ~32 bpp a JPG
      // decompresses to. r153's KTX2Loader.load() delivers the texture via
      // callback and returns nothing, so a placeholder goes out immediately
      // and the transcoded result is copied in on arrival. KTX2Loader
      // already sets LinearFilter + no-mipmaps for single-level data.
      const placeholder = new THREE.CompressedTexture(
        [],
        1,
        1,
        THREE.RGBA_S3TC_DXT1_Format as THREE.CompressedPixelFormat
      );
      ktx2Loader.load(
        path.replace(/\.jpg$/i, ".ktx2"),
        (loaded) => {
          placeholder.copy(loaded);
          placeholder.needsUpdate = true;
          registerSettled();
        },
        undefined,
        registerSettled
      );
      return placeholder;
    }
  }
  return textureLoader.load(path, registerSettled, undefined, registerSettled);
};

export const setTextureCount = (n: number) => {
  textureCount = n;
};

const getProgress = (): string => {
  const percentage = (100 * texturesDone) / textureCount;
  return `${percentage.toFixed(0)}%`;
};
