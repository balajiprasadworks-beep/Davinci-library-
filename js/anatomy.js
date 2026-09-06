/* ============================================================
   ANATOMY — the rotatable 3D body at the centre of the homepage.

   Built procedurally from primitives so the page stays fast on
   an iPad and needs no model download. The body is rendered as a
   translucent Fresnel shell with glowing organs inside, and six
   hotspots pinned to anatomical regions.

   To swap in a real scanned model later, replace buildBody()
   with a GLTFLoader call and keep HOTSPOTS as-is.
   ============================================================ */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* Anatomical anchor points, in model space. */
export const HOTSPOTS = [
  { region: "head",     label: "Head & Neuro",     pos: [0, 1.46, 0.16] },
  { region: "chest",    label: "Thorax",           pos: [0, 0.74, 0.30] },
  { region: "abdomen",  label: "Abdomen",          pos: [0, 0.30, 0.30] },
  { region: "pelvis",   label: "Pelvis",           pos: [0, -0.06, 0.28] },
  { region: "limbs",    label: "Musculoskeletal",  pos: [0.50, 0.42, 0.06] },
  { region: "systemic", label: "Systemic",         pos: [-0.50, 0.42, 0.06] },
];

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- materials ---------- */

/** Translucent shell that glows at grazing angles — the hologram read. */
function fresnelMaterial(color, power = 2.4, strength = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
        gl_FragColor = vec4(uColor, clamp(f * uStrength, 0.0, 1.0));
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function organMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/* ---------- geometry helpers ---------- */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A capsule stretched between two points — one bone or limb segment. */
function limb(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(len - radius * 2, 0.01), 4, 12);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
  return mesh;
}

function buildBody() {
  const group = new THREE.Group();
  const shell = fresnelMaterial(0x7fe3d8, 2.2, 1.15);
  const bone = fresnelMaterial(0x9fd0e8, 2.6, 0.85);

  /* Torso — a lathe profile, squashed front-to-back into a human section. */
  const profile = [
    [0.030, -0.34], [0.290, -0.28], [0.310, -0.06], [0.262, 0.20],
    [0.288, 0.46], [0.330, 0.74], [0.315, 0.94], [0.190, 1.06], [0.030, 1.10],
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), shell);
  torso.scale.set(1.14, 1, 0.74);
  group.add(torso);

  /* Head + neck */
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 26, 20), shell);
  head.position.set(0, 1.45, 0.01);
  head.scale.set(0.92, 1.16, 1.02);
  group.add(head);
  group.add(limb(V(0, 1.06, 0), V(0, 1.30, 0), 0.085, shell));

  /* Arms */
  for (const s of [-1, 1]) {
    group.add(limb(V(s * 0.34, 0.96, 0), V(s * 0.47, 0.40, 0.02), 0.088, shell)); // upper
    group.add(limb(V(s * 0.47, 0.40, 0.02), V(s * 0.545, -0.14, 0.04), 0.070, shell)); // fore
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), shell);
    hand.position.set(s * 0.56, -0.24, 0.05);
    hand.scale.set(0.8, 1.25, 0.5);
    group.add(hand);
  }

  /* Legs */
  for (const s of [-1, 1]) {
    group.add(limb(V(s * 0.155, -0.30, 0), V(s * 0.175, -0.98, 0.01), 0.115, shell)); // thigh
    group.add(limb(V(s * 0.175, -0.98, 0.01), V(s * 0.185, -1.62, 0.02), 0.088, shell)); // shin
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), shell);
    foot.position.set(s * 0.185, -1.70, 0.09);
    foot.scale.set(0.75, 0.5, 1.6);
    group.add(foot);
  }

  /* Spine — reads as the axis of the figure */
  group.add(limb(V(0, -0.28, -0.09), V(0, 1.04, -0.06), 0.032, bone));

  /* Ribs — a few arcs are enough to say "thorax" */
  for (let i = 0; i < 5; i++) {
    const y = 0.86 - i * 0.115;
    const r = 0.30 + Math.sin(i * 0.6) * 0.022;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 6, 26, Math.PI * 1.15), bone);
    rib.position.set(0, y, -0.02);
    rib.rotation.set(Math.PI / 2, 0, Math.PI * 0.42);
    rib.scale.set(1.1, 0.72, 1);
    group.add(rib);
  }

  /* Organs — the glow you see through the shell */
  const organs = [
    { c: 0xffc46b, p: [0, 1.46, 0.0], s: [0.15, 0.13, 0.15] },     // brain
    { c: 0xff7a95, p: [-0.05, 0.72, 0.04], s: [0.10, 0.11, 0.09] }, // heart
    { c: 0x6ee7db, p: [0.17, 0.74, 0.0], s: [0.11, 0.16, 0.10] },   // lung R
    { c: 0x6ee7db, p: [-0.19, 0.74, 0.0], s: [0.11, 0.16, 0.10] },  // lung L
    { c: 0xe0a45c, p: [0.14, 0.40, 0.04], s: [0.14, 0.09, 0.10] },  // liver
    { c: 0x9ad46e, p: [-0.12, 0.32, 0.04], s: [0.10, 0.09, 0.08] }, // stomach
    { c: 0x8fb8ff, p: [0.13, 0.16, -0.05], s: [0.06, 0.08, 0.05] }, // kidney R
    { c: 0x8fb8ff, p: [-0.13, 0.16, -0.05], s: [0.06, 0.08, 0.05] },// kidney L
    { c: 0xc9a55c, p: [0, -0.02, 0.02], s: [0.14, 0.09, 0.10] },    // pelvic
  ];
  for (const o of organs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), organMaterial(o.c));
    m.position.set(...o.p);
    m.scale.set(...o.s);
    group.add(m);
  }

  return group;
}

/* ---------- hotspot sprites ---------- */

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
export function initAnatomy(canvas, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.25, 4.5);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xbfe8ff, 1.1);
  key.position.set(2, 3, 4);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);
  root.add(buildBody());

  /* Ground halo — anchors the figure in space */
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 1.5, 48),
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
  halo.position.y = -1.82;
  root.add(halo);

  /* Hotspots */
  const tex = ringTexture();
  const pins = HOTSPOTS.map((h) => {
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
  controls.minDistance = 3.0;
  controls.maxDistance = 7.0;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.84;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.7;
  controls.target.set(0, 0.12, 0);

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

  /** Project a pin to CSS pixels inside the canvas, for the floating card. */
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
      const base = p === selected ? 0.40 : p === hovered ? 0.36 : 0.30;
      p.scale.setScalar(base + Math.sin(t * 2 + i * 1.1) * 0.022);
      p.material.opacity = p === selected ? 1 : 0.72 + Math.sin(t * 2 + i * 1.1) * 0.15;
    });

    // Breathing — subtle, keeps the figure alive without distracting.
    if (!REDUCED) root.position.y = Math.sin(t * 0.7) * 0.018;

    controls.update();
    renderer.render(scene, camera);

    // The card follows the pin while the model rotates.
    if (selected) emit();
  }
  frame();

  /* Stop rendering when the tab or section is out of view — saves battery. */
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
    /** Programmatically open a region (used by the legend buttons). */
    focusRegion(region) {
      const pin = pins.find((p) => p.userData.region === region) ?? null;
      selected = pin;
      controls.autoRotate = pin ? false : !REDUCED;
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
