import * as THREE from "three";
import { onLoaded } from "./loading";

let textureCount = 0;
let texturesDone = 0;
const textureLoader = new THREE.TextureLoader();

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

export const loadTexture = (path: string) => {
  return textureLoader.load(path, registerSettled, undefined, registerSettled);
};

export const setTextureCount = (n: number) => {
  textureCount = n;
};

const getProgress = (): string => {
  const percentage = (100 * texturesDone) / textureCount;
  return `${percentage.toFixed(0)}%`;
};
