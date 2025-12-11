import normalizeWheel from "https://cdn.skypack.dev/normalize-wheel@1.0.1";
import { gsap } from "https://cdn.skypack.dev/gsap@3.12.5";

const GRID_GAP = 1;
const TILE_WIDTH = 6;
const TILE_HEIGHT = 8;
const TILE_SPACE_X = TILE_WIDTH + GRID_GAP;
const TILE_SPACE_Y = TILE_HEIGHT + GRID_GAP;
const BASE_COLS = 5;
const BASE_ROWS = 5;
const GRID_SIZE_X = TILE_SPACE_X * BASE_COLS;
const GRID_SIZE_Y = TILE_SPACE_Y * BASE_ROWS;
const TOTAL_GRID_SIZE_X = GRID_SIZE_X * 3;
const TOTAL_GRID_SIZE_Y = GRID_SIZE_Y * 3;
const IMAGE_RES = 512;

const CANVAS_W = IMAGE_RES;
const CANVAS_H = Math.round(IMAGE_RES * (TILE_HEIGHT / TILE_WIDTH));

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

async function createImageWithTextTexture(item, radius = 24) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  roundRectPath(ctx, 0, 0, CANVAS_W, CANVAS_H, radius);
  ctx.save();
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
  const items = nodes.map(node => {
    let linkEl = node.querySelector('[grid="link"]');
    let link = null;
    if (linkEl) {
      if (linkEl.tagName === "A" && linkEl.href) link = linkEl.href;
      else if (linkEl.getAttribute && linkEl.getAttribute("href")) link = linkEl.getAttribute("href");
      else if (linkEl.dataset && linkEl.dataset.href) link = linkEl.dataset.href;
    }

    let imgEl = node.querySelector('[grid="img"]');
    let imgUrl = null;
    if (imgEl) {
      if (imgEl.tagName === "IMG" && imgEl.src) imgUrl = imgEl.src;
      else if (imgEl.getAttribute("src")) imgUrl = imgEl.getAttribute("src");
      else if (imgEl.dataset && imgEl.dataset.src) imgUrl = imgEl.dataset.src;
      else {
        const bg = imgEl.style && imgEl.style.backgroundImage;
        if (bg && bg.startsWith("url")) {
          imgUrl = bg.replace(/url\(['"]?/, "").replace(/['"]?\)$/, "");
        }
      }
    }

    let textEl = node.querySelector('[grid="text"]');
    let textContent = textEl ? textEl.textContent.trim() : null;

    const categoryEls = node.querySelectorAll('[filter-field="category"].filter_text_target');
    const categories = Array.from(categoryEls)
      .map(el => el.textContent.trim())
      .filter(Boolean);

    if (!link || !imgUrl) {
      return null;
    }

    return {
      link,
      imgUrl,
      textContent,
      categories
    };
  }).filter(Boolean);

  return items;
}

function getActiveCategories() {
  const activeNodes = Array.from(document.querySelectorAll('.filter_text[filter="true"]'));
  const active = activeNodes.map(el => el.textContent.trim()).filter(Boolean);
  return active;
}

function computeFilteredItems(allItems) {
  const active = getActiveCategories();
  if (!active.length) {
    return allItems.slice();
  }
  const filtered = allItems.filter(item => {
    if (!item.categories || !item.categories.length) return false;
    return item.categories.some(cat => active.includes(cat));
  });
  return filtered;
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
    this.resize();
    this.setupListeners();
    this.render();
  }

  init() {
    this.direction = { x: 1, y: 1 };
    this.scroll = {
      ease: 0.08,
      scale: 0.04,
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
    this.DRAG_THRESHOLD = 8;
    this.startX = 0;
    this.startY = 0;
    this.hoveredMesh = null;
    this.allMeshesLoaded = false;

    this.allItems = getCMSItemsFromDOM();
    this.currentItems = [];
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
    this.camera.position.z = 30;
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.addObjects();
  }

  async addObjects() {
    const filtered = computeFilteredItems(this.allItems);
    this.currentItems = this.buildRepeatedItems(filtered);

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
        const isUV = item && item.categories && item.categories.includes("ÜV");
        mesh.userData.link = (item && !isUV) ? item.link : null;

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
  }

  buildRepeatedItems(filtered) {
    if (!filtered || !filtered.length) {
      const arr = [];
      for (let i = 0; i < BASE_COLS * BASE_ROWS; i++) {
        arr.push({
          link: "#",
          imgUrl: null,
          textContent: null,
          categories: []
        });
      }
      return arr;
    }

    const result = [];
    const len = filtered.length;
    const totalSlots = BASE_COLS * BASE_ROWS;

    for (let i = 0; i < totalSlots; i++) {
      const item = filtered[i % len];
      result.push(item);
    }
    return result;
  }

  async applyFilter() {
    if (!this.allMeshesLoaded) return;

    const filtered = computeFilteredItems(this.allItems);
    this.currentItems = this.buildRepeatedItems(filtered);

    const texturePromises = this.currentItems.slice(0, BASE_COLS * BASE_ROWS).map(item =>
      createImageWithTextTexture(item)
    );
    const textures = await Promise.all(texturePromises);

    this.baseMeshes.forEach((mesh, i) => {
      const tex = textures[i] || textures[0];
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
      const item = this.currentItems[i];
      const isUV = item && item.categories && item.categories.includes("ÜV");
      mesh.userData.link = (item && !isUV) ? item.link : null;
    });

    TILE_GROUPS.forEach(obj => {
      obj.group.children.forEach((clone, i) => {
        const tex = textures[i] || textures[0];
        clone.material.map = tex;
        clone.material.needsUpdate = true;
        const item = this.currentItems[i];
        const isUV = item && item.categories && item.categories.includes("ÜV");
        clone.userData.link = (item && !isUV) ? item.link : null;
      });
    });

    const allMaterials = [];
    TILE_GROUPS.forEach(obj => {
      obj.group.children.forEach(mesh => allMaterials.push(mesh.material));
    });

    gsap.fromTo(
      allMaterials,
      { opacity: 0 },
      { opacity: 1, duration: 0.6, stagger: 0.01, ease: "power2.out" }
    );
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
    this.camera.aspect = this.screen.width / this.screen.height;
    this.camera.updateProjectionMatrix();

    if (this.screen.width < 768) {
      this.camera.position.z = 35;
      this.scroll.scale = 0.06;
    } else {
      this.camera.position.z = 30;
      this.scroll.scale = 0.04;
    }

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

    this.renderer.domElement.addEventListener("click", (ev) => {
      if (!this.allMeshesLoaded) return;
      if (this.isDown || this.isDragging) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.clickableMeshes, true);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const link = mesh.userData.link;
        if (link && link !== "#") {
          window.location.href = link;
        }
      }
    }, false);
  }

  render() {
    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(() => {
      this.scroll.current = {
        x: lerp(this.scroll.current.x, this.scroll.target.x, this.scroll.ease),
        y: lerp(this.scroll.current.y, this.scroll.target.y, this.scroll.ease)
      };

      if (this.scroll.current.y > this.scroll.last.y) this.direction.y = -1;
      else if (this.scroll.current.y < this.scroll.last.y) this.direction.y = 1;

      if (this.scroll.current.x > this.scroll.last.x) this.direction.x = -1;
      else if (this.scroll.current.x < this.scroll.last.x) this.direction.x = 1;

      this.setPositions();
      this.scroll.last = { x: this.scroll.current.x, y: this.scroll.current.y };
      this.render();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});