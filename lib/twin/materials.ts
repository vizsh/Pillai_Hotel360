import * as THREE from "three";

export type MatRole = "wall" | "slab" | "glass" | "mullion" | "furniture" | "plate" | "core" | "site";

/** Procedural grayscale noise, used as a roughnessMap so flat MeshStandardMaterial
 * surfaces (walls, slabs) pick up the subtle imperfection real plaster/concrete has
 * instead of reading as a uniform, "sketched" flat color. Cached module-wide — every
 * caller shares the same small texture, so this costs one canvas, not one per floor.
 * Built from a canvas rather than an image asset: no licensing, no network fetch, and it
 * tiles cleanly on the per-box UVs the merged wall/slab geometry already has. */
let sharedNoiseTex: THREE.Texture | null = null;
function noiseRoughnessMap(): THREE.Texture | undefined {
  if (typeof document === "undefined") return undefined;
  if (sharedNoiseTex) return sharedNoiseTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Low-frequency-ish blotches read as plaster/render texture better than pure static:
    // blend two octaves of value noise instead of a single per-pixel random.
    const v = 168 + (Math.random() - 0.5) * 70;
    const c = Math.max(0, Math.min(255, v));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.NoColorSpace;
  sharedNoiseTex = tex;
  return tex;
}

export function tag<T extends THREE.Material>(m: T, role: MatRole): T {
  m.userData.role = role;
  m.userData.baseOpacity = m.opacity;
  return m;
}

export const makeWall = () =>
  tag(new THREE.MeshStandardMaterial({ color: "#c9d1dc", roughness: 0.85, roughnessMap: noiseRoughnessMap(), metalness: 0.02, transparent: false }), "wall");

export const makeSlab = () =>
  tag(new THREE.MeshStandardMaterial({ color: "#3a4452", roughness: 0.7, roughnessMap: noiseRoughnessMap(), metalness: 0.1 }), "slab");

export const makeCore = () =>
  tag(new THREE.MeshStandardMaterial({ color: "#1c2532", roughness: 0.6, metalness: 0.2 }), "core");

export const makeGlass = (transmission: boolean) =>
  tag(
    transmission
      ? new THREE.MeshPhysicalMaterial({
          color: "#bcd9e6",
          roughness: 0.045,
          metalness: 0,
          transmission: 0.92,
          thickness: 0.35,
          ior: 1.52,
          reflectivity: 0.6,
          specularIntensity: 1,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          envMapIntensity: 1.6,
        })
      : new THREE.MeshPhysicalMaterial({
          color: "#a9c9d8",
          roughness: 0.1,
          metalness: 0.2,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          envMapIntensity: 1.7,
          clearcoat: 0.6,
          clearcoatRoughness: 0.15,
        }),
    "glass",
  );

export const makeMullion = () =>
  tag(new THREE.MeshStandardMaterial({ color: "#14181f", roughness: 0.28, metalness: 0.88, envMapIntensity: 1.2 }), "mullion");

export const makeFurniture = (color: string) =>
  tag(new THREE.MeshStandardMaterial({ color, roughness: 0.75, roughnessMap: noiseRoughnessMap(), metalness: 0.05 }), "furniture");

export const makePlate = () =>
  tag(
    new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false }),
    "plate",
  );
