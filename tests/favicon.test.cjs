const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// 控制真实加载器的图片事件与时钟，验证断网、旧缓存和异步预览切换。
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

function fixture() {
  const images = [], timers = new Map(), writes = [], canvases = [];
  let timerId = 0;
  class Element {
    constructor() {
      this.children = [];
      this.style = {};
      this.value = '';
      this.classList = { add() {}, remove() {} };
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { this.children.push(child); }
    querySelector() { return this.label; }
  }
  class FakeImage extends Element {
    constructor() { super(); images.push(this); }
    succeed(size = 32) {
      this.naturalWidth = this.naturalHeight = size;
      if (this.onload) this.onload();
    }
    fail() { if (this.onerror) this.onerror(); }
  }
  class Canvas {
    constructor() { canvases.push(this); }
    getContext() {
      return { drawImage: image => {
        if (/^https?:/.test(image.src) && image.crossOrigin !== 'anonymous') throw new Error('Tainted canvas');
      } };
    }
    toDataURL(type) { assert.equal(type, 'image/png'); return PNG_DATA; }
  }
  const elements = Object.fromEntries(['siteUrl', 'siteName', 'modalIconPreview', 'syncIconBtn', 'toast']
    .map(id => [id, new Element()]));
  elements.syncIconBtn.label = new Element();
  const context = vm.createContext({
    URL, Promise, Image: FakeImage,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: { readyState: 'loading', addEventListener() {}, createElement: tag => tag === 'canvas' ? new Canvas() : new Element(),
      getElementById: id => elements[id] },
    localStorage: { setItem: (key, value) => writes.push({ key, value: JSON.parse(value) }) }
  });
  let source = fs.readFileSync(path.join(__dirname, '..', 'src', 'script.js'), 'utf8');
  source = source.replace("  if (document.readyState === 'loading') {", `
    globalThis.faviconTest = {
      candidates: faviconCandidates, sources: faviconSources, load: loadFavicon, save: cacheFavicon,
      attach: attachFavicon, sync: syncBookmarkIcon, defaults: DEFAULT_BOOKMARKS,
      setCache: function (value) { faviconCache = value; },
      cache: function () { return faviconCache; }
    };
    return;
    if (document.readyState === 'loading') {`);
  vm.runInContext(source, context);
  function tick() {
    const [id, timer] = Array.from(timers.entries()).find(([, timer]) => timer.delay === 5000);
    timers.delete(id);
    assert.equal(timer.delay, 5000);
    timer.callback();
  }
  return { api: context.faviconTest, images, timers, writes, canvases, elements, tick, box: () => new Element() };
}

test('全部默认书签使用真实内置文件，加载成功时不请求外部服务', () => {
  const f = fixture();
  assert.equal(f.api.defaults.length, 14);
  for (const bookmark of f.api.defaults) {
    const box = f.box(), start = f.images.length;
    f.api.attach(box, bookmark);
    const image = f.images[start];
    assert.ok(image.src.startsWith('icons/sites/'));
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', image.src)));
    assert.equal(image.referrerPolicy, 'no-referrer');
    image.succeed();
    assert.equal(f.images.length, start + 1);
    assert.equal(box.children[0], image);
    assert.equal(f.api.cache()[new URL(bookmark.url).hostname], image.src);
  }
  assert.equal(f.timers.size, 0);
});

test('旧版 Google 和 DuckDuckGo 缓存自动清除，不再重试这些来源', () => {
  const f = fixture();
  for (const old of ['https://www.google.com/s2/favicons?domain=example.com&sz=128',
    'https://icons.duckduckgo.com/ip3/example.com.ico']) {
    f.api.setCache({ 'example.com': old });
    const list = Array.from(f.api.sources('https://example.com/private?token=secret'));
    assert.deepEqual(list, ['https://favicon.so/example.com', 'https://favicon.cccyun.cc/example.com', 'https://example.com/favicon.ico']);
    assert.equal(f.api.cache()['example.com'], undefined);
  }
  assert.ok(f.writes.every(write => !Object.values(write.value).some(value => value.includes('google') || value.includes('duckduckgo'))));
});

test('图标服务失败后读取网站自身图标，合法的 16px 图标也能显示', () => {
  const f = fixture(), box = f.box();
  f.api.attach(box, { name: 'Example', url: 'https://example.com:8443/path' });
  f.images[0].fail();
  f.images[1].fail();
  f.images[2].fail();
  f.images[3].fail();
  assert.equal(f.images[4].src, 'https://example.com:8443/favicon.ico');
  f.images[4].succeed(16);
  assert.equal(box.children[0], f.images[4]);
  assert.equal(f.api.cache()['example.com'].dataUrl, PNG_DATA);
  assert.equal(f.timers.size, 0);
});

test('网络一直无响应时每 5 秒切换来源，最终保留首字母且移除旧事件', () => {
  const f = fixture(), box = f.box();
  f.api.attach(box, { name: 'Example', url: 'https://example.com' });
  f.tick();
  assert.equal(f.images[0].onload, null);
  assert.equal(f.images[0].onerror, null);
  assert.equal(f.images[1].src, 'https://favicon.cccyun.cc/example.com');
  f.tick();
  assert.equal(f.images[2].src, 'https://example.com/favicon.ico');
  f.tick();
  assert.equal(box.children[0].textContent, 'E');
  assert.equal(f.timers.size, 0);
  assert.equal(f.writes.length, 0);
});

test('预览改为另一个网址时取消旧加载，旧图片无法覆盖新预览', () => {
  const f = fixture(), box = f.box();
  f.api.attach(box, { name: 'Old', url: 'https://old.example' });
  const oldImage = f.images[0];
  f.api.attach(box, { name: 'New', url: 'https://new.example' });
  oldImage.succeed();
  assert.equal(box.children[0].textContent, 'N');
  f.images[1].succeed();
  assert.equal(box.children[0], f.images[1]);
  assert.equal(f.api.cache()['old.example'], undefined);
  assert.equal(f.timers.size, 0);
});

test('同步默认网站时重试远程来源，断网后用内置图标并恢复按钮', () => {
  const f = fixture();
  f.elements.siteUrl.value = 'https://www.baidu.com';
  f.elements.siteName.value = '百度';
  f.api.sync();
  assert.equal(f.elements.syncIconBtn.disabled, true);
  assert.equal(f.images[0].src, 'https://favicon.so/www.baidu.com');
  f.tick();
  f.tick();
  f.tick();
  assert.equal(f.images[3].src, 'icons/sites/www.baidu.com.ico');
  f.images[3].succeed();
  assert.equal(f.elements.syncIconBtn.disabled, false);
  assert.equal(f.elements.syncIconBtn.label.textContent, '同步图标');
  assert.equal(f.elements.toast.textContent, '图标已同步');
});

test('无效网址和非 HTTP 网址直接返回空列表', () => {
  const f = fixture();
  for (const url of ['', 'invalid', 'javascript:alert(1)', 'file:///favicon.ico']) {
    assert.deepEqual(Array.from(f.api.candidates(url)), []);
  }
});

test('成功获取的图片持久保存，重新打开时只加载本地图片且不重复写入', () => {
  const f = fixture(), url = 'https://example.com';
  f.api.attach(f.box(), { name: 'Example', url });
  assert.equal(f.images[0].crossOrigin, 'anonymous');
  f.images[0].succeed(256);
  assert.equal(f.canvases[0].width, 128);
  assert.equal(f.canvases[0].height, 128);
  const stored = f.writes[0];
  assert.equal(stored.key, 'local:faviconCache');
  assert.equal(stored.value['example.com'].dataUrl, PNG_DATA);
  assert.equal(stored.value['example.com'].source, 'https://favicon.so/example.com');
  const reopened = fixture(), box = reopened.box();
  reopened.api.setCache(stored.value);
  reopened.api.attach(box, { name: 'Example', url });
  assert.equal(reopened.images[0].src, PNG_DATA);
  reopened.images[0].succeed();
  assert.equal(reopened.images.length, 1);
  assert.equal(box.children[0], reopened.images[0]);
  assert.equal(reopened.writes.length, 0);
  assert.equal(reopened.timers.size, 0);
});

test('旧的远程地址缓存成功读取后升级为图片缓存', () => {
  const f = fixture();
  f.api.setCache({ 'example.com': 'https://favicon.cccyun.cc/example.com' });
  f.api.attach(f.box(), { name: 'Example', url: 'https://example.com' });
  f.images[0].succeed();
  assert.equal(f.api.cache()['example.com'].dataUrl, PNG_DATA);
});

test('本地图片损坏时自动重新获取并替换缓存', () => {
  const f = fixture();
  f.api.setCache({ 'example.com': { source: 'https://favicon.cccyun.cc/example.com', dataUrl: PNG_DATA, updatedAt: 1 } });
  f.api.attach(f.box(), { name: 'Example', url: 'https://example.com' });
  f.images[0].fail();
  assert.equal(f.images[1].src, 'https://favicon.so/example.com');
  f.images[1].succeed();
  assert.ok(f.api.cache()['example.com'].updatedAt > 1);
});

test('同步跳过图片缓存并保存新图，同步失败仍能使用旧图片', () => {
  const f = fixture();
  const source = 'https://favicon.so/example.com';
  f.api.setCache({ 'example.com': { source, dataUrl: PNG_DATA, updatedAt: 1 } });
  f.elements.siteUrl.value = 'https://example.com';
  f.elements.siteName.value = 'Example';
  f.api.sync();
  assert.equal(f.images[0].src, source);
  f.images[0].succeed();
  assert.ok(f.api.cache()['example.com'].updatedAt > 1);
  const stored = JSON.stringify(f.api.cache());
  f.api.sync();
  f.tick();
  f.tick();
  f.tick();
  assert.equal(JSON.stringify(f.api.cache()), stored);
  assert.equal(f.elements.toast.textContent, '同步失败，已保留原图标');
  assert.equal(f.images.at(-1).src, PNG_DATA);
  assert.equal(f.elements.syncIconBtn.disabled, false);
});

test('不允许跨域读取的网站图标照常显示，不破坏已有本地图片', () => {
  const f = fixture(), box = f.box();
  const original = { source: 'https://favicon.cccyun.cc/example.com', dataUrl: PNG_DATA, updatedAt: 1 };
  f.api.setCache({ 'example.com': original });
  f.api.load(['https://example.com/favicon.ico'], (image, source) => {
    box.appendChild(image);
    assert.equal(f.api.save(image, source, 'https://example.com'), false);
  });
  f.images[0].fail();
  f.images[1].succeed();
  assert.equal(box.children[0], f.images[1]);
  assert.equal(f.api.cache()['example.com'], original);
  assert.equal(f.writes.length, 0);
});

test('图片缓存过大时删除最早的条目，并保持新图片和长宽比', () => {
  const f = fixture(), largeCache = {};
  for (let index = 0; index < 24; index++) {
    largeCache['old-' + index + '.example'] = { source: 'https://favicon.cccyun.cc/old-' + index + '.example',
      dataUrl: 'data:image/png;base64,' + 'A'.repeat(100 * 1024), updatedAt: index + 1 };
  }
  f.api.setCache(largeCache);
  f.api.attach(f.box(), { name: 'New', url: 'https://new.example' });
  const image = f.images[0];
  image.naturalWidth = 1024; image.naturalHeight = 512; image.onload();
  assert.equal(f.canvases[0].width, 128);
  assert.equal(f.canvases[0].height, 64);
  assert.ok(JSON.stringify(f.api.cache()).length <= 2 * 1024 * 1024);
  assert.equal(f.api.cache()['old-0.example'], undefined);
  assert.ok(f.api.cache()['old-23.example']);
  assert.equal(f.api.cache()['new.example'].dataUrl, PNG_DATA);
});

test('Favicon.so 失败后尝试彩虹，成功图片持久缓存并可离线重开', () => {
  const f = fixture(), url = 'https://example.com/private?token=secret';
  f.api.attach(f.box(), { name: 'Example', url });
  f.tick();
  assert.equal(f.images[1].src, 'https://favicon.cccyun.cc/example.com');
  assert.equal(f.images[1].crossOrigin, 'anonymous');
  f.images[1].succeed();
  const cached = f.writes[0].value;
  assert.equal(cached['example.com'].source, 'https://favicon.cccyun.cc/example.com');
  assert.equal(cached['example.com'].dataUrl, PNG_DATA);
  const reopened = fixture();
  reopened.api.setCache(cached);
  reopened.api.attach(reopened.box(), { name: 'Example', url });
  assert.equal(reopened.images[0].src, PNG_DATA);
  reopened.images[0].succeed();
  assert.equal(reopened.images.length, 1);
  assert.equal(reopened.writes.length, 0);
});
