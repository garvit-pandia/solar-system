import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer";
import { LAYERS } from "../constants";

export interface PointOfInterest {
  name: string;
  y: number;
  z: number;
  type?: string;
}

export class Label {
  parent: THREE.Object3D;
  radius: number;
  elements: CSS2DObject[];

  /**
   * Represents a collection of labels for a celestial body.
   * @constructor
   * @param parent - Parent object for the labels.
   * @param radius - Distance between parent centre and label positions.
   */
  constructor(parent: THREE.Object3D, radius: number) {
    this.parent = parent;
    this.radius = radius;
    this.elements = [];
  }

  createPOILabel = (poi: PointOfInterest) => {
    const container = document.createElement("div");
    container.className = "label";

    // The inner wrapper carries our collision offset — CSS2DRenderer owns
    // the OUTER element's transform every frame, so the inner div is the
    // only place a persistent screen-space offset survives.
    const inner = document.createElement("div");
    inner.className = "label-inner";

    if (poi.type) {
      const img = document.createElement("img");
      img.src = `./icons/${poi.type}.svg`;
      inner.appendChild(img);
    }

    const text = document.createElement("p");
    text.textContent = poi.name;
    inner.appendChild(text);

    container.appendChild(inner);

    const label = new CSS2DObject(container);
    label.center.set(0, 0);
    label.layers.set(LAYERS.POILabel);
    label.layers.disable(LAYERS.POILabel);

    const labelPosition = this.rotateLabel(poi.y, poi.z).toArray();
    label.position.set(...labelPosition);

    this.parent.add(label);
    this.elements.push(label);
  };

  /**
   * Show all point-of-interest labels.
   */
  showPOI = () => {
    this.elements.forEach((label) => {
      label.layers.enable(LAYERS.POILabel);
    });
  };

  /**
   * Hides all point-of-interest labels.
   */
  hidePOI = () => {
    this.elements.forEach((label) => {
      label.layers.disable(LAYERS.POILabel);
    });
  };

  /**
   * Update label opacities depending on camera position and direction,
   * then push overlapping labels apart in screen space.
   * @param camera - Camera used to calculate distance and direction to labels.
   */
  update = (camera: THREE.Camera) => {
    this.elements.forEach((label) => {
      const rotationOpacity = this.getRotationOpacity(camera, label);
      const distanceOpacity = this.getDistanceOpacity(camera);
      const opacity = rotationOpacity * distanceOpacity;
      label.element.style.opacity = opacity.toString();
    });
    this.resolveCollisions();
  };

  /** Max screen-space nudge per label, in px (collision resolution). */
  private static MAX_OFFSET = 90;
  /** Vertical pitch of a stacked label group, in px. */
  private static STACK_PITCH = 26;

  /** Offsets persist across frames (the renderer re-anchors every frame;
   *  we recover the anchor by subtracting the current transform). */
  private persistentOffsets = new Map<HTMLElement, { x: number; y: number }>();

  /**
   * Push overlapping label chips apart in screen space. Small n (≤ ~6 per
   * body) so pairwise checks are cheap. Offsets live on the inner wrapper
   * (the renderer overwrites the outer element's transform every frame).
   *
   * Two stages: vector repulsion with a vertical bias, then any remaining
   * collision clusters are fanned into tidy vertical stacks (guarantees
   * zero overlap even for dense clusters like Mars' five POIs). All math is
   * done on DESIRED rects (anchor + offset), so the result is stable across
   * frames and never drifts or resets.
   */
  private resolveCollisions = (): void => {
    const visible = this.elements.filter(
      (label) => label.element.style.display !== "none"
    );
    const inners = visible.map(
      (label) => label.element.firstElementChild as HTMLElement
    );
    if (inners.length < 2) return;

    const clamp = (v: number) =>
      Math.max(-Label.MAX_OFFSET, Math.min(Label.MAX_OFFSET, v));

    // Recover each chip's renderer anchor: rect minus current transform.
    interface Anchor { x: number; y: number; w: number; h: number }
    const anchors = new Map<HTMLElement, Anchor>();
    inners.forEach((el) => {
      const r = el.getBoundingClientRect();
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
        el.style.transform
      );
      const ox = m ? parseFloat(m[1]) : 0;
      const oy = m ? parseFloat(m[2]) : 0;
      anchors.set(el, { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });
      const prev = this.persistentOffsets.get(el);
      this.persistentOffsets.set(el, { x: prev?.x ?? ox, y: prev?.y ?? oy });
    });
    const off = (el: HTMLElement) =>
      this.persistentOffsets.get(el) as { x: number; y: number };
    const desired = (el: HTMLElement) => {
      const a = anchors.get(el) as Anchor;
      const o = off(el);
      return {
        left: a.x + o.x,
        top: a.y + o.y,
        right: a.x + o.x + a.w,
        bottom: a.y + o.y + a.h,
      };
    };

    // Stage 1 — vector repulsion with vertical bias.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < inners.length; i++) {
        for (let j = i + 1; j < inners.length; j++) {
          const a = inners[i];
          const b = inners[j];
          const ra = desired(a);
          const rb = desired(b);
          if (ra.right - ra.left === 0 || rb.right - rb.left === 0) continue;

          const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (overlapX <= 0 || overlapY <= 0) continue;

          let dx = (ra.left + ra.right - rb.left - rb.right) / 2;
          let dy = (ra.top + ra.bottom - rb.top - rb.bottom) / 2;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; // exact overlap
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;
          dy += Math.sign(dy || 1) * 0.35; // vertical bias
          const dlen = Math.hypot(dx, dy);
          dx /= dlen;
          dy /= dlen;

          const push = Math.min(overlapX, overlapY) / 2 + 3; // +3px gap
          const oa = off(a);
          const ob = off(b);
          oa.x = clamp(oa.x + dx * push);
          oa.y = clamp(oa.y + dy * push);
          ob.x = clamp(ob.x - dx * push);
          ob.y = clamp(ob.y - dy * push);
        }
      }
    }

    // Stage 2 — fan remaining collision clusters into vertical stacks.
    const parent = new Map<HTMLElement, HTMLElement>();
    const find = (el: HTMLElement): HTMLElement => {
      let root = el;
      while (parent.get(root) !== root) root = parent.get(root) as HTMLElement;
      return root;
    };
    inners.forEach((el) => parent.set(el, el));

    let anyOverlap = false;
    for (let i = 0; i < inners.length; i++) {
      for (let j = i + 1; j < inners.length; j++) {
        const ra = desired(inners[i]);
        const rb = desired(inners[j]);
        if (ra.right - ra.left === 0 || rb.right - rb.left === 0) continue;
        const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (overlapX <= 0 || overlapY <= 0) continue;
        anyOverlap = true;
        const ra_ = find(inners[i]);
        const rb_ = find(inners[j]);
        if (ra_ !== rb_) parent.set(rb_, ra_);
      }
    }

    if (anyOverlap) {
      const groups = new Map<HTMLElement, HTMLElement[]>();
      inners.forEach((el) => {
        const root = find(el);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(el);
      });

      groups.forEach((members) => {
        if (members.length < 2) return;
        const rects = members.map((el) => desired(el));
        const meanTop = rects.reduce((s, r) => s + r.top, 0) / rects.length;
        const meanCenterX =
          rects.reduce((s, r) => s + (r.left + r.right) / 2, 0) / rects.length;
        const startY = meanTop - ((members.length - 1) * Label.STACK_PITCH) / 2;
        const sorted = [...members].sort(
          (a, b) => desired(a).top - desired(b).top
        );
        sorted.forEach((el, idx) => {
          const r = desired(el);
          const o = off(el);
          // Translate the chip so its top lands on the stack row.
          o.y = clamp(startY + idx * Label.STACK_PITCH - (r.top - o.y));
          o.x = clamp(meanCenterX - (r.left + r.right) / 2);
        });
      });
    }

    inners.forEach((el) => {
      const o = off(el);
      el.style.transform = `translate(${o.x}px, ${o.y}px)`;
    });
  };

  private rotateLabel = (y: number, z: number) => {
    const vector = new THREE.Vector3(this.radius, 0, 0);
    vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), y);
    vector.applyAxisAngle(new THREE.Vector3(0, 0, 1), z);
    return vector;
  };

  private getRotationOpacity = (
    camera: THREE.Camera,
    label: CSS2DObject
  ): number => {
    const hideThreshold = 1;
    const fadeThreshold = 0.75;

    // Calculates the great-circle distance between the camera and label with normalised vectors.
    const cameraVector = camera.position.clone().normalize();
    const labelVector = label.position.clone().normalize();
    const delta = Math.acos(cameraVector.dot(labelVector));

    if (delta > hideThreshold) {
      return 0;
    } else if (delta > fadeThreshold) {
      return (hideThreshold - delta) / (hideThreshold - fadeThreshold);
    } else {
      return 1;
    }
  };

  private getDistanceOpacity = (camera: THREE.Camera): number => {
    const hideThreshold = this.radius * 12;
    const fadeThreshold = this.radius * 8;
    const distance = camera.position.length();

    if (distance > hideThreshold) {
      return 0;
    } else if (distance > fadeThreshold) {
      return (hideThreshold - distance) / (hideThreshold - fadeThreshold);
    } else {
      return 1;
    }
  };
}
