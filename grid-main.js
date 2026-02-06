import normalizeWheel from "https://cdn.skypack.dev/normalize-wheel@1.0.1";
import { EffectComposer, RenderPass, ShaderPass } from "https://cdn.skypack.dev/postprocessing@6.27.0";
import { gsap } from "https://cdn.skypack.dev/gsap@3.12.5";

const GRID_GAP = 1;
const TILE_WIDTH = 6;
const TILE_HEIGHT = 8;
const TILE_SIZE = TILE_WIDTH;
const TILE_SPACE_X = TILE_WIDTH + GRID_GAP;
const TILE_SPACE_Y = TILE_HEIGHT + GRID_GAP;
const BASE_COLS = 5;
const BASE_ROWS = 5;
const GRID_SIZE_X = TILE_SPACE_X * BASE_COLS;
const GRID_SIZE_Y = TILE_SPACE_Y * BASE_ROWS;
const TOTAL_GRID_SIZE_X = GRID_SIZE_X * 3;
const TOTAL_GRID_SIZE_Y = GRID_SIZE_Y * 3;
const IMAGE_RES = 512;

// Canvas méret, amin a kép + szöveg készül
const CANVAS_W = IMAGE_RES;
const CANVAS_H = Math.round(IMAGE_RES * (TILE_HEIGHT / TILE_WIDTH));

const FALLBACK_URL = `https://picsum.photos/${IMAGE_RES}?random=1`;

const distortionShader = {
uniforms: {
tDiffuse: { value: null },
uStrength: { value: new THREE.Vector2() },
uScreenRes: { value: new THREE.Vector2() },
uReducedMotion: { value: 0.0 }
},
vertexShader: document.getElementById("vertexShader")?.textContent || "",
fragmentShader: document.getElementById("fragmentShader")?.textContent || ""
};

function lerp(start, end, amount) {
return start * (1 - amount) + end * amount;
}

function loadImage(url) {
return new Promise((res, rej) => {
const img = new Image();
img.crossOrigin = "anonymous";
img.onload = () => res(img);
img.onerror = (e) => rej(e);
img.src = url;
});
}

function roundRectPath(ctx, x, y, w, h, r) {
const radius = Math.min(r, w / 2, h / 2);
ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.arcTo(x + w, y, x + w, y + h, radius);
ctx.arcTo(x + w, y + h, x, y + h, radius);
ctx.arcTo(x, y + h, x, y, radius);
ctx.arcTo(x, y, x + w, y, radius);
ctx.closePath();
}

// Kép + opcionális szöveg egyetlen CanvasTexture-be
async function createImageWithTextTexture(item, radius = 24) {
const canvas = document.createElement("canvas");
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext("2d");
ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

// Háttér / kép kirajzolás
ctx.save();
roundRectPath(ctx, 0, 0, CANVAS_W, CANVAS_H, radius);
ctx.clip();

if (item.imgUrl) {
try {
const img = await loadImage(item.imgUrl);
const imgRatio = img.width / img.height;
const canvasRatio = CANVAS_W / CANVAS_H;
let drawW, drawH, dx, dy;
if (imgRatio > canvasRatio) {
drawH = CANVAS_H;
drawW = img.width * (CANVAS_H / img.height);
dx = (CANVAS_W - drawW) / 2;
dy = 0;
} else {
drawW = CANVAS_W;
drawH = img.height * (CANVAS_W / img.width);
dx = 0;
dy = (CANVAS_H - drawH) / 2;
}
ctx.drawImage(img, dx, dy, drawW, drawH);
} catch (e) {
ctx.fillStyle = "#252528";
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}
} else {
ctx.fillStyle = "#252528";
ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}
ctx.restore();

// Szöveg rárajzolása (ha használsz textContent-et)
if (item.textContent) {
const padding = 24;
const textAreaHeight = CANVAS_H * 0.4;
const textYStart = CANVAS_H - textAreaHeight + padding;

ctx.fillStyle = "rgba(0,0,0,0.55)";
ctx.fillRect(0, CANVAS_H - textAreaHeight, CANVAS_W, textAreaHeight);

ctx.fillStyle = "white";
ctx.font = "bold 40px Arial, sans-serif";
ctx.textAlign = "left";
ctx.textBaseline = "top";

const maxWidth = CANVAS_W - padding * 2;
const words = item.textContent.split(" ");
const lines = [];
let line = "";

words.forEach(word => {
const testLine = line + word + " ";
if (ctx.measureText(testLine).width > maxWidth && line !== "") {
lines.push(line);
line = word + " ";
} else {
line = testLine;
}
});
if (line) lines.push(line);

let y = textYStart;
const lineHeight = 46;
const maxLines = Math.floor((textAreaHeight - padding * 2) / lineHeight);
for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
ctx.fillText(lines[i], padding, y);
y += lineHeight;
}
}

const texture = new THREE.CanvasTexture(canvas);
texture.needsUpdate = true;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
return texture;
}

function getCMSItemsFromDOM() {
const nodes = Array.from(document.querySelectorAll('[grid="item"]'));

const items = nodes.map((node, index) => {
// LINK
let linkEl = node.querySelector('[grid="link"]');
let link = null;
if (linkEl) {
if (linkEl.tagName === "A" && linkEl.href) link = linkEl.href;
else if (linkEl.getAttribute && linkEl.getAttribute("href")) link = linkEl.getAttribute("href");
else if (linkEl.dataset && linkEl.dataset.href) link = linkEl.dataset.href;
}

// KÉP
let imgEl = node.querySelector('[grid="img"]');
let imgUrl = null;
if (imgEl) {
if (imgEl.tagName === "IMG" && imgEl.src) imgUrl = imgEl.src;
else if (imgEl.getAttribute("src")) imgUrl = imgEl.getAttribute("src");
else if (imgEl.dataset && imgEl.dataset.src) imgUrl = imgEl.dataset.src;
else {
const bg = imgEl.style && imgEl.style.backgroundImage;
if (bg && bg.startsWith("url")) {
imgUrl = bg.replace(/url\\(['"]?/, "").replace(/['"]?\\)$/, "");
}
}
}

// SZÖVEG (div [grid="text"]) – ha nem kell, ezt kiveheted
let textEl = node.querySelector('[grid="text"]');
let textContent = textEl ? textEl.textContent.trim() : null;

// Csak akkor használjuk, ha van link ÉS kép
if (!link || !imgUrl) {
return null;
}

return {
link,
imgUrl,
textContent
};
}).filter(Boolean);

console.log(`[GRID] Összes érvényes CMS elem: ${items.length}`);

return items;
}

const TILE_GROUPS = [
{ pos: [GRID_SIZE_X * -1, GRID_SIZE_Y * 1, 0] },
{ pos: [0, GRID_SIZE_Y * 1, 0] },
{ pos: [GRID_SIZE_X * 1, GRID_SIZE_Y * 1, 0] },
{ pos: [GRID_SIZE_X * -1, 0, 0] },
{ pos: [0, 0, 0] },
{ pos: [GRID_SIZE_X * 1, 0, 0] },
{ pos: [GRID_SIZE_X * -1, GRID_SIZE_Y * -1, 0] },
{ pos: [0, GRID_SIZE_Y * -1, 0] },
{ pos: [GRID_SIZE_X * 1, GRID_SIZE_Y * -1, 0] },
];

class App {
constructor() {
this.init();
this.setupRenderer();
this.setupCamera();
this.setupScene();
this.setupComposer();
this.resize();
this.setupListeners();
this.render();
}

init() {
this.direction = { x: 1, y: 1 };
this.scroll = {
ease: 0.05,
scale: 0.02,
current: { x: 0, y: 0 },
target: { x: 0, y: 0 },
last: { x: 0, y: 0 }
};

TILE_GROUPS.forEach(obj => {
obj.offset = { x: 0, y: 0 };
obj.group = new THREE.Group();
});

this.raycaster = new THREE.Raycaster();
this.mouse = new THREE.Vector2();
this.clickableMeshes = [];

this.isDown = false;
this.isDragging = false;
this.DRAG_THRESHOLD = 20;
this.startX = 0;
this.startY = 0;
this.hoveredMesh = null;
this.allMeshesLoaded = false;

this.allItems = getCMSItemsFromDOM();
this.currentItems = this.buildRepeatedItems(this.allItems);
this.baseMeshes = [];
}

setupRenderer() {
this.renderer = new THREE.WebGLRenderer({ alpha: true });
document.body.appendChild(this.renderer.domElement);

this.renderer.setClearColor(0x000000, 0);

this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
}

setupCamera() {
this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
this.camera.position.z = 20;
}

setupScene() {
this.scene = new THREE.Scene();
this.addObjects();
}

setupComposer() {
this.composer = new EffectComposer(this.renderer);
const renderPass = new RenderPass(this.scene, this.camera);
this.composer.addPass(renderPass);
const shaderPass = new ShaderPass(new THREE.ShaderMaterial(distortionShader), "tDiffuse");
this.composer.addPass(shaderPass);
}

async addObjects() {
const startX = -((BASE_COLS - 1) * TILE_SPACE_X) / 2;
const startY = ((BASE_ROWS - 1) * TILE_SPACE_Y) / 2;

const texturePromises = this.currentItems.slice(0, BASE_COLS * BASE_ROWS).map(item =>
createImageWithTextTexture(item)
);
const textures = await Promise.all(texturePromises);

let idx = 0;
for (let row = 0; row < BASE_ROWS; row++) {
for (let col = 0; col < BASE_COLS; col++) {
const posX = startX + col * TILE_SPACE_X;
const posY = startY - row * TILE_SPACE_Y;
const tex = textures[idx] || textures[0];

const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
material.opacity = 0;

const geometry = new THREE.PlaneBufferGeometry(TILE_WIDTH, TILE_HEIGHT);
const mesh = new THREE.Mesh(geometry, material);
mesh.position.set(posX, posY, 0);

const item = this.currentItems[idx];
mesh.userData.link = item ? item.link : null;

this.baseMeshes.push(mesh);
idx++;
}
}

TILE_GROUPS.forEach(obj => {
this.baseMeshes.forEach(m => {
const clone = m.clone();
clone.material = m.material.clone();
clone.material.map = m.material.map;
clone.material.opacity = 0;
clone.userData.link = m.userData.link;
obj.group.add(clone);
this.clickableMeshes.push(clone);
});
this.scene.add(obj.group);
});

const fadeInGrid = () => {
if (this.allMeshesLoaded) return;
const allMeshes = [];
TILE_GROUPS.forEach(obj => {
obj.group.children.forEach(mesh => allMeshes.push(mesh));
});
gsap.to(allMeshes.map(m => m.material), {
opacity: 1,
stagger: 0.02,
duration: 0.5,
ease: "power2.out"
});
this.allMeshesLoaded = true;
};

if (window.logoFinished) {
fadeInGrid();
} else {
window.addEventListener("logo-finished", () => fadeInGrid(), { once: true });
}
}

buildRepeatedItems(items) {
if (!items || !items.length) {
const arr = [];
for (let i = 0; i < BASE_COLS * BASE_ROWS; i++) {
arr.push({
link: "#",
imgUrl: null,
textContent: null
});
}
return arr;
}

const result = [];
const len = items.length;
const totalSlots = BASE_COLS * BASE_ROWS;

for (let i = 0; i < totalSlots; i++) {
const item = items[i % len];
result.push(item);
}
return result;
}

setPositions() {
const scrollX = this.scroll?.current.x || 0;
const scrollY = this.scroll?.current.y || 0;

TILE_GROUPS.forEach(({ offset, pos, group }, i) => {
const posX = pos[0] + scrollX + offset.x;
const posY = pos[1] + scrollY + offset.y;

group.position.set(posX, posY, pos[2]);

const groupOffX = GRID_SIZE_X / 2;
const viewportOff = { x: this.viewport.width / 2, y: this.viewport.height / 2 };

if (this.direction.x < 0 && posX - groupOffX > viewportOff.x) {
TILE_GROUPS[i].offset.x -= TOTAL_GRID_SIZE_X;
} else if (this.direction.x > 0 && posX + groupOffX < -viewportOff.x) {
TILE_GROUPS[i].offset.x += TOTAL_GRID_SIZE_X;
}

const groupOffY = GRID_SIZE_Y / 2;
if (this.direction.y < 0 && posY - groupOffY > viewportOff.y) {
TILE_GROUPS[i].offset.y -= TOTAL_GRID_SIZE_Y;
} else if (this.direction.y > 0 && posY + groupOffY < -viewportOff.y) {
TILE_GROUPS[i].offset.y += TOTAL_GRID_SIZE_Y;
}
});
}

resize() {
this.screen = { width: window.innerWidth, height: window.innerHeight };
this.renderer.setSize(this.screen.width, this.screen.height);
this.composer.setSize(this.screen.width, this.screen.height);
this.camera.aspect = this.screen.width / this.screen.height;
this.camera.updateProjectionMatrix();

if (this.screen.width < 768) {
this.camera.position.z = 30;
this.scroll.scale = 0.08;
} else {
this.camera.position.z = 20;
this.scroll.scale = 0.02;
}

distortionShader.uniforms.uScreenRes.value = new THREE.Vector2(this.screen.width, this.screen.height);

const fov = this.camera.fov * (Math.PI / 180);
const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
const width = height * this.camera.aspect;
this.viewport = { height, width };

this.setPositions();
}

onTouchDown(e) {
this.isDown = true;
this.isDragging = false;
this.scroll.position = { x: this.scroll.current.x, y: this.scroll.current.y };
this.startX = e.touches ? e.touches[0].clientX : e.clientX;
this.startY = e.touches ? e.touches[0].clientY : e.clientY;
}

onTouchMove(e) {
if (!this.isDown) return;
const x = e.touches ? e.touches[0].clientX : e.clientX;
const y = e.touches ? e.touches[0].clientY : e.clientY;
if (Math.abs(this.startX - x) > this.DRAG_THRESHOLD || Math.abs(this.startY - y) > this.DRAG_THRESHOLD) {
this.isDragging = true;
}
const distanceX = (this.startX - x) * this.scroll.scale;
const distanceY = (this.startY - y) * this.scroll.scale;
this.scroll.target = { x: this.scroll.position.x - distanceX, y: this.scroll.position.y + distanceY };
}

onTouchUp() {
  this.isDown = false;
  // egy kicsi késleltetéssel engedjük el a drag-et, hogy a tap még működjön
  setTimeout(() => {
    this.isDragging = false;
  }, 50);
}

onWheel(e) {
e.preventDefault();
const normalized = normalizeWheel(e);
this.scroll.target.x -= normalized.pixelX * this.scroll.scale;
this.scroll.target.y += normalized.pixelY * this.scroll.scale;
}

setupListeners() {
window.addEventListener("resize", this.resize.bind(this));
window.addEventListener("wheel", this.onWheel.bind(this), { passive: false });
window.addEventListener("mousewheel", this.onWheel.bind(this), { passive: false });

window.addEventListener("mousedown", this.onTouchDown.bind(this));
window.addEventListener("mousemove", this.onTouchMove.bind(this));
window.addEventListener("mouseup", this.onTouchUp.bind(this));

window.addEventListener("touchstart", this.onTouchDown.bind(this));
window.addEventListener("touchmove", this.onTouchMove.bind(this));
window.addEventListener("touchend", this.onTouchUp.bind(this));

this.renderer.domElement.addEventListener("mousemove", (ev) => {
if (!this.allMeshesLoaded) return;
const rect = this.renderer.domElement.getBoundingClientRect();
const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
this.mouse.set(x, y);
this.raycaster.setFromCamera(this.mouse, this.camera);
const intersects = this.raycaster.intersectObjects(this.clickableMeshes, true);
if (intersects.length > 0) {
const mesh = intersects[0].object;
if (this.hoveredMesh !== mesh) {
if (this.hoveredMesh) {
gsap.to(this.hoveredMesh.scale, { x: 1, y: 1, z: 1, duration: 1, ease: "elastic.out(1,0.48)" });
}
gsap.to(mesh.scale, { x: 1.04, y: 1.04, z: 1, duration: 1, ease: "elastic.out(1,0.48)" });
this.hoveredMesh = mesh;
}
} else {
if (this.hoveredMesh) {
gsap.to(this.hoveredMesh.scale, { x: 1, y: 1, z: 1, duration: 1, ease: "elastic.out(1,0.48)" });
this.hoveredMesh = null;
}
}
});

const onTap = (clientX, clientY, ev) => {
  if (!this.allMeshesLoaded) return;

  // ha nagyon húztad az ujjad, ne kattintson
  if (this.isDragging) return;

  const rect = this.renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;

  this.mouse.set(x, y);
  this.raycaster.setFromCamera(this.mouse, this.camera);
  const intersects = this.raycaster.intersectObjects(this.clickableMeshes, true);

  console.log("[GRID] intersects count:", intersects.length);

  if (intersects.length > 0) {
    const mesh = intersects[0].object;
    const link = mesh.userData.link;
    console.log("[GRID] hit mesh link:", link);

    if (link && link !== "#") {
      ev.preventDefault();
      window.open(link, "_self");
      console.log("[GRID] próbálok navigálni:", link);
    } else {
      console.log("[GRID] nincs érvényes link userData.link-ben");
    }
  } else {
    console.log("[GRID] nincs intersect");
  }
};

// egér (desktop)
this.renderer.domElement.addEventListener("pointerdown", (ev) => {
  if (ev.pointerType === "mouse") {
    console.log("[GRID] pointerdown (mouse)", ev.clientX, ev.clientY);
    onTap(ev.clientX, ev.clientY, ev);
  }
}, { passive: false });

// érintés (mobil)
this.renderer.domElement.addEventListener("touchend", (ev) => {
  if (!ev.changedTouches || !ev.changedTouches[0]) return;
  const t = ev.changedTouches[0];
  console.log("[GRID] touchend", t.clientX, t.clientY);
  onTap(t.clientX, t.clientY, ev);
}, { passive: false });
}

render() {
this.composer.render();

requestAnimationFrame(() => {
this.scroll.current = {
x: lerp(this.scroll.current.x, this.scroll.target.x, this.scroll.ease),
y: lerp(this.scroll.current.y, this.scroll.target.y, this.scroll.ease)
};

if (this.scroll.current.y > this.scroll.last.y) this.direction.y = -1;
else if (this.scroll.current.y < this.scroll.last.y) this.direction.y = 1;

if (this.scroll.current.x > this.scroll.last.x) this.direction.x = -1;
else if (this.scroll.current.x < this.scroll.last.x) this.direction.x = 1;

distortionShader.uniforms.uStrength.value = new THREE.Vector2(
Math.abs(((this.scroll.current.x - this.scroll.last.x) / this.screen.width) * 10),
Math.abs(((this.scroll.current.y - this.scroll.last.y) / this.screen.width) * 10)
);

this.setPositions();
this.scroll.last = { x: this.scroll.current.x, y: this.scroll.current.y };
this.render();
});
}
}

document.addEventListener("DOMContentLoaded", () => {
window.app = new App();
});
