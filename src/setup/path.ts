import * as THREE from "three";

/**
 * Segment count adapted to the orbit radius: inner rings (tiny in view mode)
 * get light geometry, outer rings stay smooth when true-scale stretches
 * them to hundreds of thousands of units.
 */
const segmentCount = (radius: number): number =>
  Math.min(2048, Math.max(256, Math.round(radius * 96)));

/** Dash-flow drift rate, in unit-circle radians per real second. The path
 * geometry is a unit circle, so the dash pattern (and its offset) lives in
 * "radians of arc" — scale-independent across view/true-scale modes. */
const DASH_DRIFT = 0.22;
/** Dash 12% of the ring, gap 48% — sparse ticks that read as motion. */
const DASH_SIZE = 0.12 * Math.PI * 2;
const GAP_SIZE = 0.48 * Math.PI * 2;

/** Per-material dash-offset uniforms, animated by {@link updateOrbitFlow}. */
const dashOffsetUniforms: { value: number }[] = [];

export interface PathOptions {
  /**
   * Dashed ring with an animated "flow" showing travel direction
   * (used for the Sun-orbiting rings; moon rings stay solid).
   * The dash pattern lives in the geometry's line-distance attribute, so
   * the uniform circles stay on the PathFader's opacity machinery.
   */
  dashed?: boolean;
}

export const createPath = (radius: number, options: PathOptions = {}) => {
  const points: THREE.Vector3[] = [];
  const count = segmentCount(radius);

  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const x = Math.sin(theta);
    const z = Math.cos(theta);
    points.push(new THREE.Vector3(x, 0, z));
  }

  points.push(new THREE.Vector3(0, 0, 1));

  let material: THREE.LineBasicMaterial;
  if (options.dashed) {
    material = new THREE.LineDashedMaterial({
      color: "white",
      transparent: true,
      opacity: 0.25,
      dashSize: DASH_SIZE,
      gapSize: GAP_SIZE,
    });
    // Inject a dash-offset uniform so the pattern can drift along the ring
    // (LineDashedMaterial has no native offset). One closure per material —
    // each path keeps its own uniform object.
    const offset = { value: 0 };
    dashOffsetUniforms.push(offset);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDashOffset = offset;
      shader.vertexShader = shader.vertexShader.replace(
        "vLineDistance = lineDistance;",
        "vLineDistance = lineDistance + uDashOffset;"
      );
    };
  } else {
    material = new THREE.LineBasicMaterial({
      color: "white",
      transparent: true,
      opacity: 0.25,
    });
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  const mesh = new THREE.Line(geometry, material);
  // LineDashedMaterial needs the cumulative arc length per vertex (in unit
  // circle radians, since the geometry has radius 1) for the dash pattern.
  if (options.dashed) mesh.computeLineDistances();
  mesh.scale.set(radius, radius, radius);
  mesh.visible = false;

  return mesh;
};

/** Per-frame dash drift — call from the main tick. */
export const updateOrbitFlow = (elapsedTime: number): void => {
  const offset = (elapsedTime * DASH_DRIFT) % (DASH_SIZE + GAP_SIZE);
  for (const uniform of dashOffsetUniforms) uniform.value = offset;
};
