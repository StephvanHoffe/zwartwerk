/* ==========================================================================
   Khoffie — draaiende koffiezak in 3D (homepage)
   Een stazak: bol in het midden, plat dichtgeseald aan de bovenkant en het
   dikst aan de onderkant. De voor- en achterkant zijn de echte zakfoto's.
   Laadt pas na de pagina; zonder WebGL blijft de gewone foto staan.
   ========================================================================== */
const THREE_URL = "./vendor/three.module.min.js";

const holder = document.querySelector("[data-zak3d]");
if (holder) {
  const start = () => import(THREE_URL).then(init).catch(() => { /* foto blijft staan */ });
  if (document.readyState === "complete") setTimeout(start, 50);
  else window.addEventListener("load", () => setTimeout(start, 50), { once: true });
}

function init(THREE) {
  const img = holder.querySelector("img");
  const canvas = document.createElement("canvas");
  canvas.className = "zak3d-canvas";
  canvas.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) {
    return; // geen WebGL: foto blijft staan
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // ---- maten (breedte 1, hoogte volgens de foto)
  const W = 1;
  const H = 965 / 602;
  const DEPTH = 0.36;        // dikte onderin
  const SEAL = 0.9;          // vanaf hier (van onder gemeten) is de zak plat dichtgeseald
  const NX = 72, NY = 110;

  const ease = (t) => t * t * (3 - 2 * t);
  // dikte over de hoogte: dik onderin, loopt rustig af naar de seal bovenin
  const thick = (v) => {
    if (v >= SEAL) return 0;
    const t = v / SEAL;                       // 0 onderin, 1 bij de seal
    return DEPTH * Math.pow(1 - ease(t), 0.75) * (0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, v * 4)));
  };
  // bolling over de breedte: 0 bij de zijnaden, vol in het midden
  const bulge = (u) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.6)), 0.55);

  function surface(sign, mirror) {
    const g = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      for (let i = 0; i <= NX; i++) {
        const u = i / NX;
        const x = (u - 0.5) * W;
        const y = (v - 0.5) * H;
        // 0.004: voor- en achterkant raken elkaar net niet, anders flikkeren de naden
        const z = sign * (0.004 + 0.5 * thick(v) * bulge(u));
        pos.push(mirror ? -x : x, y, z);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        if (sign > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
      }
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // bodem: lensvorm die de voor- en achterkant onderin sluit
  function bottom() {
    const shape = new THREE.Shape();
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = (u - 0.5) * W, z = 0.5 * thick(0) * bulge(u);
      if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    for (let i = n; i >= 0; i--) {
      const u = i / n; shape.lineTo((u - 0.5) * W, -0.5 * thick(0) * bulge(u));
    }
    const g = new THREE.ShapeGeometry(shape, 24);
    g.rotateX(Math.PI / 2);
    g.translate(0, -H / 2 + 0.002, 0);
    return g;
  }

  const scene = new THREE.Scene();
  const bag = new THREE.Group();
  scene.add(bag);

  const loader = new THREE.TextureLoader();
  let loaded = 0;
  const tex = (src) => {
    const t = loader.load(src, () => {
      // pas tonen als beide kanten binnen zijn, zodat er nooit een lege zak verschijnt
      if (++loaded === 2) { resize(); holder.classList.add("is-3d"); }
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const frontSrc = img.currentSrc || img.src;
  const backSrc = holder.getAttribute("data-back");
  const mat = (map) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const front = new THREE.Mesh(surface(1, false), mat(tex(frontSrc)));
  const back = new THREE.Mesh(surface(-1, true), mat(tex(backSrc)));
  const base = new THREE.Mesh(bottom(), new THREE.MeshStandardMaterial({ color: 0x24409a, roughness: 0.7, side: THREE.DoubleSide }));
  bag.add(front, back, base);

  // licht: zacht van boven, strijklicht van links voor de bolling
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9dccb, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(-2.2, 1.6, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff1df, 0.6);
  rim.position.set(2.5, 0.5, -2);
  scene.add(rim);

  // camera: de zak vult het vak van de foto; het canvas is iets ruimer voor de dikte
  const FOV = 20;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const PAD_X = 1.3, PAD_Y = 1.08;
  function resize() {
    const r = img.getBoundingClientRect();
    if (!r.width) return;
    const w = r.width * PAD_X, h = r.height * PAD_Y;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = (H * PAD_Y / 2) / Math.tan((FOV * Math.PI) / 360);
    camera.position.set(0, 0.12, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    draw(true);
  }

  holder.appendChild(canvas);

  // ---- draaien
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let angle = still ? -0.45 : -0.2;
  let speed = (Math.PI * 2) / 16;          // één rondje per 16 seconden
  let visible = true, hover = false, drag = null, last = 0, dirty = true;

  function draw(force) {
    if (force) dirty = true;
    if (!dirty) return;
    bag.rotation.y = angle;
    bag.rotation.x = 0.04;
    renderer.render(scene, camera);
    dirty = false;
  }
  function tick(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    if (!still && visible && !hover && !drag && !document.hidden) { angle += speed * dt; dirty = true; }
    draw();
    requestAnimationFrame(tick);
  }

  // met de muis of vinger zelf draaien
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, a: angle }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (drag) { angle = drag.a + (e.clientX - drag.x) * 0.012; dirty = true; } });
  const endDrag = () => { drag = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  holder.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") hover = true; });
  holder.addEventListener("pointerleave", () => { hover = false; });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(holder);
  }
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(tick);
}
