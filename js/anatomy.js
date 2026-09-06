/* ============================================================
   ANATOMY — the rotatable figure at the centre of the homepage.

   Built procedurally, but to real proportions: 7.5 heads tall,
   with muscle bellies (biceps, quadriceps, gastrocnemius) shaped
   by tapered lathe profiles rather than uniform capsules, and lit
   as a solid sculpted body rather than a wireframe hologram.

   Nothing is downloaded, so it stays fast on an iPad.

   USING A REAL ANATOMICAL MODEL INSTEAD
   -------------------------------------
   Procedural geometry gets you a well-proportioned figure, but it
   cannot look like a scanned cadaver — that needs a sculpted mesh.
   Set ANATOMY.modelUrl in js/config.js to a .glb/.gltf file and it
   is used instead: the model is auto-scaled to the same height and
   stood on the same floor, so the region hotspots still line up.
   The built-in figure stays as the fallback if the file is missing
   or fails to parse, so the page can never end up empty.
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* Anatomical landmarks.
   pos  = where the marker sits, just off the skin
   core = centre of the region, for the highlight glow
   glow = ellipsoid radii of that highlight */
export const HOTSPOTS = [
  {
    region: "head", label: "Head & Neuro",
    pos: [0, 1.60, 0.15], core: [0, 1.52, 0], glow: [0.29, 0.31, 0.29],
  },
  {
    region: "chest", label: "Thorax",
    pos: [0, 0.86, 0.30], core: [0, 0.86, 0], glow: [0.42, 0.28, 0.27],
  },
  {
    region: "abdomen", label: "Abdomen",
    pos: [0, 0.48, 0.26], core: [0, 0.46, 0], glow: [0.36, 0.26, 0.25],
  },
  {
    region: "pelvis", label: "Pelvis",
    pos: [0.19, 0.14, 0.20], core: [0, 0.12, 0], glow: [0.38, 0.24, 0.25],
  },
  {
    region: "limbs", label: "Musculoskeletal",
    pos: [0.30, -0.42, 0.18], core: [0.20, -0.45, 0], glow: [0.28, 0.48, 0.28],
  },
  {
    region: "systemic", label: "Systemic",
    pos: [-0.47, 0.66, 0.16], core: [0, 0.55, 0], glow: [0.56, 1.12, 0.44],
  },
];

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* The figure occupies a fixed box so the hotspots above line up whether
   the body is the built-in one or a loaded model. */
const FIGURE_HEIGHT = 3.44;
const FIGURE_FLOOR = -1.72;

/** Scale and stand any object in that same box. */
function fitFigure(obj) {
  obj.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  if (!size.y) return;

  obj.scale.multiplyScalar(FIGURE_HEIGHT / size.y);
  obj.updateMatrixWorld(true);

  const b = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (b.min.x + b.max.x) / 2;
  obj.position.z -= (b.min.z + b.max.z) / 2;
  obj.position.y += FIGURE_FLOOR - b.min.y;
}

function disposeGroup(obj) {
  obj.traverse((o) => o.geometry?.dispose());
}

/* ---------- geometry helpers ---------- */

/**
 * A limb segment swept between two points, with a radius profile along
 * its length. This is what gives the figure muscle bellies instead of
 * the sausage look of a plain capsule.
 *
 * @param {THREE.Vector3} a start (t = 0)
 * @param {THREE.Vector3} b end   (t = 1)
 * @param {Array<[number, number]>} profile [t, radius] pairs, t ascending
 */
function taperedLimb(a, b, profile, material, segments = 20) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const pts = profile.map(([t, r]) =>
    new THREE.Vector2(Math.max(r, 0.002), (t - 0.5) * len)
  );
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, segments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return mesh;
}

/** An ellipsoid — joints, cranium, hands, feet. */
function blob(material, pos, scale, segments = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments - 4), material);
  m.position.set(...pos);
  m.scale.set(...scale);
  return m;
}

/* ---------- the body ---------- */

/** A surface of revolution from a [radius, y] profile — one continuous skin. */
function lathe(profile, material, segments = 36) {
  return new THREE.Mesh(
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)),
      segments
    ),
    material
  );
}

function buildBody(material) {
  const g = new THREE.Group();

  /* --- torso ---------------------------------------------------
     One continuous surface from pubis to shoulder shelf: pelvis
     flare, waist pinch, ribcage swell, then the shoulder slope.
     Squashed front-to-back so the section is a human oval.
     Ball joints are deliberately avoided everywhere — they are what
     made the earlier version read as an artist's mannequin. */
  const torso = lathe([
    [0.001, -0.02], [0.120, 0.00], [0.196, 0.05], [0.232, 0.12],
    [0.244, 0.22], [0.238, 0.33], [0.226, 0.44], [0.234, 0.55],
    [0.256, 0.66], [0.276, 0.78], [0.292, 0.88], [0.288, 0.97],
    [0.252, 1.03], [0.168, 1.07], [0.092, 1.09],
  ], material);
  torso.scale.set(1.34, 1, 0.73);
  g.add(torso);

  /* Glutes — without these the pelvis has no silhouette in profile. */
  const glutes = blob(material, [0, 0.075, -0.085], [0.285, 0.155, 0.125], 24);
  g.add(glutes);

  /* --- neck and head ---
     The head is a single lathe: chin, jaw taper, cranium, crown.
     One surface, so there is no seam running across the face. */
  g.add(taperedLimb(V(0, 1.00, -0.012), V(0, 1.26, 0.008),
    [[0, 0.104], [0.45, 0.081], [1, 0.078]], material, 24));

  const head = lathe([
    [0.001, 1.222], [0.060, 1.240], [0.100, 1.272], [0.129, 1.310],
    [0.149, 1.354], [0.160, 1.404], [0.163, 1.458], [0.157, 1.510],
    [0.140, 1.562], [0.107, 1.608], [0.059, 1.642], [0.001, 1.658],
  ], material, 32);
  head.scale.set(0.96, 1, 1.10);
  head.position.z = 0.012;
  g.add(head);

  /* --- arms ---
     The upper arm starts wide enough to double as the deltoid, so the
     shoulder joins the torso without a separate ball. */
  for (const s of [-1, 1]) {
    const shoulder = V(s * 0.338, 1.010, 0);
    const elbow    = V(s * 0.428, 0.495, 0.012);
    const wrist    = V(s * 0.466, 0.042, 0.026);

    g.add(taperedLimb(shoulder, elbow, [
      [0, 0.132], [0.14, 0.126], [0.34, 0.110], [0.70, 0.082], [1, 0.066],
    ], material, 24));

    g.add(taperedLimb(elbow, wrist, [
      [0, 0.068], [0.22, 0.080], [0.55, 0.069], [0.85, 0.048], [1, 0.041],
    ], material, 24));

    /* Hand — flattened, tapering to the fingers. */
    const hand = taperedLimb(V(s * 0.470, 0.026, 0.026), V(s * 0.476, -0.142, 0.028), [
      [0, 0.041], [0.30, 0.054], [0.75, 0.049], [1, 0.022],
    ], material, 16);
    hand.scale.set(1, 1, 0.52);
    g.add(hand);
  }

  /* --- legs ---
     Thighs touch at the groin and separate below, as they actually do. */
  for (const s of [-1, 1]) {
    const hip   = V(s * 0.132, 0.140, 0);
    const knee  = V(s * 0.178, -0.720, 0.012);
    const ankle = V(s * 0.192, -1.545, -0.005);

    g.add(taperedLimb(hip, knee, [
      [0, 0.168], [0.16, 0.162], [0.42, 0.142], [0.78, 0.108], [1, 0.090],
    ], material, 26));

    g.add(taperedLimb(knee, ankle, [
      [0, 0.092], [0.16, 0.107], [0.40, 0.095], [0.80, 0.055], [1, 0.044],
    ], material, 24));

    /* Foot — a wedge running forward from the ankle. */
    const foot = taperedLimb(V(s * 0.192, -1.610, -0.045), V(s * 0.196, -1.678, 0.135), [
      [0, 0.052], [0.35, 0.062], [0.75, 0.055], [1, 0.030],
    ], material, 16);
    foot.scale.set(1, 1, 0.62);
    g.add(foot);
  }

  return g;
}

/* ---------- hotspot marker texture ---------- */

function ringTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const cx = 64;

  const glow = ctx.createRadialGradient(cx, cx, 6, cx, cx, 62);
  glow.addColorStop(0, "rgba(227,200,138,0.55)");
  glow.addColorStop(0.55, "rgba(227,200,138,0.10)");
  glow.addColorStop(1, "rgba(227,200,138,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = "rgba(240,222,175,0.95)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cx, 34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,245,220,0.98)";
  ctx.beginPath();
  ctx.arc(cx, cx, 11, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- main ---------- */

/**
 * Mount the anatomy scene.
 * @param {HTMLCanvasElement} canvas
 * @param {{ onSelect?: (payload:{region:string,label:string,x:number,y:number}|null)=>void }} opts
 */
export function initAnatomy(canvas, { onSelect, modelUrl = "" } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0.5, 0.35, 5.2);

  /* Three-point lighting — this is what makes it read as sculpted
     rather than flat. Warm key, cool fill, teal rim from behind. */
  scene.add(new THREE.HemisphereLight(0xcfe8f5, 0x2b2318, 0.68));

  const key = new THREE.DirectionalLight(0xffe6c2, 1.85);
  key.position.set(2.6, 3.2, 3.4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbcd8ff, 0.72);
  fill.position.set(-3.2, 0.8, 2.2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xa8f0e6, 0.62);
  rim.position.set(-1.4, 1.8, -3.6);
  scene.add(rim);

  const skin = new THREE.MeshStandardMaterial({
    color: 0xd8c1a8,
    roughness: 0.66,
    metalness: 0.0,
    flatShading: false,
  });

  const root = new THREE.Group();
  scene.add(root);

  /* Show the built-in figure immediately, then swap in the real model
     when it finishes downloading. If the model 404s or fails to parse,
     the built-in figure simply stays — the page is never left empty. */
  let body = buildBody(skin);
  root.add(body);

  if (modelUrl) {
    import("three/addons/loaders/GLTFLoader.js")
      .then(({ GLTFLoader }) => new Promise((resolve, reject) => {
        new GLTFLoader().load(modelUrl, resolve, undefined, reject);
      }))
      .then(({ scene: model }) => {
        // The scan has no UVs or textures, so give it the same lit
        // material as the fallback and it matches the rest of the page.
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.material = skin;
          // Sculpt exports (ZBrush OBJ in particular) often carry no
          // normals at all, which renders the whole body matte black.
          // Derive them from the winding when they are missing — but
          // never overwrite normals a model actually shipped with.
          if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        });
        fitFigure(model);
        root.remove(body);
        disposeGroup(body);
        body = model;
        root.add(model);
      })
      .catch((err) => {
        console.warn("Anatomy model unavailable — using the built-in figure:", err);
      });
  }

  /* Ground halo */
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.45, 48),
    new THREE.MeshBasicMaterial({
      color: 0x4fd1c5,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -1.78;
  root.add(halo);

  /* Region highlights — a soft glow through the body when a region
     is open, the way an anatomy atlas isolates a system. */
  const glowGeo = new THREE.SphereGeometry(1, 22, 16);
  const highlights = new Map();

  /* Markers */
  const tex = ringTexture();
  const pins = HOTSPOTS.map((h) => {
    const glow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe3c88a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.position.set(...h.core);
    glow.scale.set(...h.glow);
    root.add(glow);
    highlights.set(h.region, glow);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    sprite.position.set(...h.pos);
    sprite.scale.setScalar(0.3);
    sprite.renderOrder = 10;
    sprite.userData = h;
    root.add(sprite);
    return sprite;
  });

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 3.4;
  controls.maxDistance = 8.0;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.84;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.7;
  controls.target.set(0, 0.05, 0);

  /* --- picking --- */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  let selected = null;
  let pointerDownAt = 0;

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(pins, false)[0]?.object ?? null;
  }

  function screenPos(sprite) {
    const v = sprite.position.clone().applyMatrix4(root.matrixWorld).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((-v.y + 1) / 2) * r.height };
  }

  function emit() {
    if (!onSelect) return;
    if (!selected) return onSelect(null);
    const { region, label } = selected.userData;
    onSelect({ region, label, ...screenPos(selected) });
  }

  canvas.addEventListener("pointermove", (ev) => {
    const hit = pick(ev);
    if (hit !== hovered) {
      hovered = hit;
      canvas.style.cursor = hit ? "pointer" : "";
    }
  });

  canvas.addEventListener("pointerdown", (ev) => {
    pointerDownAt = ev.timeStamp;
  });

  canvas.addEventListener("pointerup", (ev) => {
    // Ignore the pointerup that ends a drag-to-rotate.
    if (ev.timeStamp - pointerDownAt > 350) return;
    const hit = pick(ev);
    if (hit) {
      selected = hit;
      controls.autoRotate = false;
    } else if (selected) {
      selected = null;
      controls.autoRotate = !REDUCED;
    } else {
      return;
    }
    emit();
  });

  /* --- resize --- */
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* --- loop --- */
  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();

    pins.forEach((p, i) => {
      const isSel = p === selected;
      const base = isSel ? 0.40 : p === hovered ? 0.36 : 0.30;
      p.scale.setScalar(base + Math.sin(t * 2 + i * 1.1) * 0.022);
      p.material.opacity = isSel ? 1 : 0.72 + Math.sin(t * 2 + i * 1.1) * 0.15;

      // Ease the region glow toward its target so it fades, not snaps.
      const glow = highlights.get(p.userData.region);
      const target = isSel ? 0.42 : p === hovered ? 0.16 : 0;
      glow.material.opacity += (target - glow.material.opacity) * 0.12;
    });

    if (!REDUCED) root.position.y = Math.sin(t * 0.7) * 0.016;

    controls.update();
    renderer.render(scene, camera);

    if (selected) emit();
  }
  frame();

  /* Stop rendering when off-screen — saves battery on iPad. */
  const vis = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) {
      running = true;
      clock.start();
      frame();
    } else if (!e.isIntersecting && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }, { threshold: 0.05 });
  vis.observe(canvas);

  return {
    focusRegion(region) {
      selected = pins.find((p) => p.userData.region === region) ?? null;
      controls.autoRotate = selected ? false : !REDUCED;
      emit();
    },
    clearSelection() {
      selected = null;
      controls.autoRotate = !REDUCED;
      emit();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      vis.disconnect();
      controls.dispose();
      renderer.dispose();
    },
  };
}
