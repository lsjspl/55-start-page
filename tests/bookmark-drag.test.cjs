const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// 在轻量布局环境中运行实际代码，覆盖拖动后的数据、取消和删除。
function fixture({ reducedMotion = false } = {}) {
  const writes = [], animations = [], nodes = {};
  class Node {
    constructor(name) {
      this.name = name;
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.isConnected = true;
      this.offsetWidth = 92;
      this.offsetHeight = 100;
      this.clientLeft = this.clientTop = 0;
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
      };
    }
    get offsetParent() { return this.isConnected ? nodes.body : null; }
    get position() { return nodes.grid.children.indexOf(this); }
    get offsetLeft() { return this === nodes.body ? 0 : (Math.max(0, this.position) % 3) * 110; }
    get offsetTop() { return this === nodes.body ? 0 : Math.floor(Math.max(0, this.position) / 3) * 118; }
    getBoundingClientRect() {
      return { left: this.offsetLeft, top: this.offsetTop, width: this.offsetWidth, height: this.offsetHeight,
        right: this.offsetLeft + this.offsetWidth, bottom: this.offsetTop + this.offsetHeight };
    }
    insertBefore(node, reference) {
      const previous = this.children.indexOf(node);
      if (previous >= 0) this.children.splice(previous, 1);
      this.children.splice(reference ? this.children.indexOf(reference) : this.children.length, 0, node);
    }
    remove() {
      this.isConnected = false;
      const index = nodes.grid.children.indexOf(this);
      if (index >= 0) nodes.grid.children.splice(index, 1);
    }
    setAttribute() {}
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, finished: Promise.resolve(),
        cancel() { this.cancelled = true; } };
      animations.push({ node: this, animation });
      return animation;
    }
    hasPointerCapture() { return false; }
  }
  nodes.body = new Node('body');
  nodes.grid = new Node('grid');
  nodes.add = new Node('add');
  nodes.zone = new Node('deleteZone');
  nodes.toast = new Node('toast');
  const items = ['A', 'B', 'C', 'D', 'E'].map(name => ({ name, url: 'https://' + name + '.example' }));
  nodes.grid.children = items.map(item => new Node(item.name));
  const elements = { bookmarksGrid: nodes.grid, addBtn: nodes.add, deleteZone: nodes.zone, toast: nodes.toast };
  const context = vm.createContext({
    console, URL, Promise, Date,
    setTimeout: () => 1, clearTimeout() {}, cancelAnimationFrame() {},
    requestAnimationFrame: () => 1,
    document: { readyState: 'loading', body: nodes.body, getElementById: id => elements[id], addEventListener() {} },
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    localStorage: { setItem: (key, value) => writes.push({ key, value: JSON.parse(value) }) }
  });
  let source = fs.readFileSync(path.join(__dirname, '..', 'src', 'script.js'), 'utf8');
  source = source.replace("  if (document.readyState === 'loading') {", `
    globalThis.dragTest = {
      setup: function (items, drag) { bookmarks = items; pointerDrag = drag; draggingIndex = 0; },
      move: liveMoveBookmark,
      finish: finishBookmarkPointer,
      order: function () { return bookmarks.map(function (item) { return item.name; }); },
      settling: function () { return settlingDrag; },
      location: currentCityLocation,
      settings: function (value) { settings = value; }
    };
    return;
    if (document.readyState === 'loading') {`);
  vm.runInContext(source, context);
  const ghost = new Node('ghost');
  ghost.style.transform = 'translate3d(220px,118px,0) scale(1.08)';
  const drag = { id: 1, btn: nodes.grid.children[0], bm: items[0], active: true,
    originalOrder: items.slice(), capture: nodes.grid, ghost, x: 220, y: 118, offsetX: 0, offsetY: 0 };
  drag.btn.classList.add('drag-src');
  context.dragTest.setup(items, drag);
  return { api: context.dragTest, nodes, drag, animations, writes,
    order: () => Array.from(context.dragTest.order()) };
}

test('连续跨行换位保留原节点，并为让位的图标播放动画', () => {
  const f = fixture();
  const source = f.drag.btn;
  f.api.move(0, 2);
  f.api.move(2, 4);
  assert.deepEqual(f.order(), ['B', 'C', 'D', 'E', 'A']);
  assert.equal(f.nodes.grid.children[4], source);
  assert.deepEqual(f.nodes.grid.children.map(node => Number(node.dataset.index)), [0, 1, 2, 3, 4]);
  assert.ok(f.animations.some(({ animation }) => animation.keyframes[0].transform.includes(',118px,')));
  assert.ok(f.animations.every(({ node }) => node !== source));
  assert.equal(f.writes.length, 0);
});

test('松手后只保存一次，回落结束后清理拖影和占位', async () => {
  const f = fixture();
  f.api.move(0, 3);
  f.api.finish(null, false);
  assert.equal(f.api.settling(), true);
  await Promise.resolve();
  assert.equal(f.api.settling(), false);
  assert.equal(f.drag.ghost.isConnected, false);
  assert.equal(f.drag.btn.classList.contains('drag-src'), false);
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].value.map(item => item.name), ['B', 'C', 'D', 'A', 'E']);
});

test('取消拖动恢复原顺序并且不保存', async () => {
  const f = fixture();
  f.api.move(0, 4);
  f.api.finish(null, true);
  await Promise.resolve();
  assert.deepEqual(f.order(), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(f.nodes.grid.children.map(node => node.name), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(f.writes.length, 0);
  assert.equal(f.drag.ghost.isConnected, false);
});

test('换位后拖到删除区删除实际拖动项，剩余顺序和索引一致', async () => {
  const f = fixture();
  f.api.move(0, 3);
  f.drag.overDelete = true;
  f.api.finish(null, false);
  await Promise.resolve();
  assert.deepEqual(f.order(), ['B', 'C', 'D', 'E']);
  assert.deepEqual(f.nodes.grid.children.map(node => node.name), ['B', 'C', 'D', 'E']);
  assert.deepEqual(f.nodes.grid.children.map(node => Number(node.dataset.index)), [0, 1, 2, 3]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.nodes.toast.textContent, '已删除 A');
});

test('减少动态效果时换位照常完成，回落没有动画时长', async () => {
  const f = fixture({ reducedMotion: true });
  f.api.move(0, 2);
  assert.equal(f.animations.length, 0);
  f.api.finish(null, false);
  await Promise.resolve();
  assert.deepEqual(f.order(), ['B', 'C', 'A', 'D', 'E']);
  assert.equal(f.animations[0].animation.options.duration, 0);
});

test('天气优先使用全球搜索保存的坐标，并兼容旧城市设置', () => {
  const f = fixture();
  f.api.settings({ city: 'Tokyo', cityLocation: { name: 'Tokyo', latitude: 35.6895, longitude: 139.6917 } });
  assert.equal(f.api.location().longitude, 139.6917);
  f.api.settings({ city: '上海市' });
  assert.equal(f.api.location().latitude, 31.2304);
  f.api.settings({ city: 'invalid', cityLocation: { latitude: 999, longitude: 999 } });
  assert.equal(f.api.location().name, '北京市');
});
