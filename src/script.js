/* 55起始页 · script.js
   功能：搜索、天气（Open-Meteo，免 key）、书签墙（图标自动读取）、
   壁纸更换 / 模糊 / 亮度、设置同步。数据只存在本机浏览器，不上传。 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }
  function domainOf(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }
  function normaliseUrl(raw) {
    var u = (raw || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  /* ---------- 存储封装：优先 chrome.storage，不可用时退回 localStorage（方便直接用浏览器打开调试） ---------- */
  var hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.storage.local;
  function storeGet(area, key) {
    return new Promise(function (resolve) {
      if (hasChromeStorage) {
        chrome.storage[area].get(key, function (r) { resolve(r ? r[key] : undefined); });
      } else {
        try { resolve(JSON.parse(localStorage.getItem(area + ':' + key))); } catch (e) { resolve(undefined); }
      }
    });
  }
  function storeSet(area, key, value) {
    return new Promise(function (resolve) {
      if (hasChromeStorage) {
        var o = {}; o[key] = value;
        chrome.storage[area].set(o, function () { resolve(); });
      } else {
        try { localStorage.setItem(area + ':' + key, JSON.stringify(value)); } catch (e) { /* 空间不足时忽略 */ }
        resolve();
      }
    });
  }

  /* ---------- 默认数据 ---------- */
  // 默认书签：来自用户截图里的网站，图标随扩展打包，可离线显示。
  var DEFAULT_BOOKMARKS = [
    { name: '百度', url: 'https://www.baidu.com' },
    { name: '谷歌', url: 'https://www.google.com' },
    { name: '抖音', url: 'https://www.douyin.com' },
    { name: '豆包', url: 'https://www.doubao.com' },
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Grok', url: 'https://grok.com' },
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
    { name: 'Twitch', url: 'https://www.twitch.tv' },
    { name: '谷歌AI Studio', url: 'https://aistudio.google.com' },
    { name: 'Copilot', url: 'https://copilot.microsoft.com' },
    { name: 'Cloudflare', url: 'https://dash.cloudflare.com' },
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Muse', url: 'https://muse.ai' }
  ];

  // 兼容旧版本保存的国内城市名称；新城市通过全球地理编码搜索并保存经纬度。
  var CITIES = [
    { name: '北京市', lat: 39.9042, lon: 116.4074 },
    { name: '上海市', lat: 31.2304, lon: 121.4737 },
    { name: '广州市', lat: 23.1291, lon: 113.2644 },
    { name: '深圳市', lat: 22.5431, lon: 114.0579 },
    { name: '成都市', lat: 30.5728, lon: 104.0668 },
    { name: '杭州市', lat: 30.2741, lon: 120.1551 },
    { name: '武汉市', lat: 30.5928, lon: 114.3055 },
    { name: '西安市', lat: 34.3416, lon: 108.9398 },
    { name: '南京市', lat: 32.0603, lon: 118.7969 },
    { name: '重庆市', lat: 29.5630, lon: 106.5516 }
  ];

  var SEARCH_ENGINES = {
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    baidu: { label: '百度', url: 'https://www.baidu.com/s?wd=' },
    bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' }
  };

  var DEFAULT_SETTINGS = {
    engine: 'google',
    city: '北京市',
    cityLocation: null,
    blur: 8,
    brightness: 100,
    iconSize: 64, // 书签图标尺寸 px，范围 48–88
    wallpaper: 'default' // 'default' 或自定义图片的 data URL 存在 local 区
  };

  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var bookmarks = DEFAULT_BOOKMARKS.slice();
  var editingIndex = -1; // -1 = 新增，>=0 = 编辑第几个
  var draggingIndex = -1;
  var pointerDrag = null, dragFrame = null, settlingDrag = false;
  var suppressBookmarkClickUntil = 0;
  // 按住约 600ms 进入编辑模式；短按打开，移动超过 8px 开始拖动。
  var longPressTimer = null;
  var longPressFired = false, longPressFiredAt = 0;
  var editMode = false; // 手机式编辑模式：全部书签显示删除角标并轻微抖动
  var contextMenuIndex = -1; // 右键菜单对应的书签下标，-1 = 菜单关闭
  var syncingIcon = false; // 图标同步进行中
  var faviconCache = {}; // domain -> 内置路径或 PNG 图片缓存，存在 chrome.storage.local
  var engineDropdown = null, engineSettingDropdown = null, cityDropdown = null; // 自定义下拉菜单实例

  /* ---------- 自定义下拉菜单 ----------
     原生 <select> 的选项列表由系统渲染，无法做成圆角样式，所以搜索栏和设置里的
     下拉全部用按钮 + 弹出菜单实现，样式与毛玻璃圆角设计一致。 */
  var CHECK_SVG = '<svg class="icon-svg check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var customDropdowns = [];
  function closeAllCustomDropdowns() {
    customDropdowns.forEach(function (dd) { dd.close(); });
  }
  function initCustomDropdown(rootId, btnId, menuId, labelId, options, getValue, onSelect) {
    var root = $(rootId), btn = $(btnId), menu = $(menuId), label = $(labelId);
    var items = [];
    function render() {
      var current = getValue();
      menu.innerHTML = '';
      items = options.map(function (opt) {
        var li = document.createElement('li');
        li.className = 'custom-menu-item' + (opt.value === current ? ' selected' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', opt.value === current ? 'true' : 'false');
        li.dataset.value = opt.value;
        li.tabIndex = -1;
        var text = document.createElement('span');
        text.textContent = opt.label;
        li.appendChild(text);
        li.insertAdjacentHTML('beforeend', CHECK_SVG);
        li.addEventListener('click', function () { choose(opt.value); });
        li.addEventListener('keydown', function (e) { onItemKey(e, opt.value); });
        menu.appendChild(li);
        return li;
      });
      var selected = options.find(function (o) { return o.value === current; }) || options[0];
      label.textContent = selected.label;
    }
    function isOpen() { return root.classList.contains('open'); }
    function open() {
      closeAllCustomDropdowns();
      root.classList.add('open');
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var idx = Math.max(0, options.findIndex(function (o) { return o.value === getValue(); }));
      if (items[idx]) items[idx].focus();
    }
    function close() {
      root.classList.remove('open');
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function choose(value) {
      close();
      btn.focus();
      if (value !== getValue()) onSelect(value);
      render();
    }
    function onItemKey(e, value) {
      var idx = options.findIndex(function (o) { return o.value === value; });
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(value); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); var next = items[(idx + 1) % items.length]; if (next) next.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); var prev = items[(idx - 1 + items.length) % items.length]; if (prev) prev.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
    }
    btn.addEventListener('click', function () { if (isOpen()) close(); else open(); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      else if (e.key === 'Escape') { close(); }
    });
    var dd = { setValue: function () { render(); }, close: close, open: open };
    customDropdowns.push(dd);
    render();
    return dd;
  }
  // 切换搜索引擎：搜索栏下拉和设置下拉双向同步，并保存
  function setEngine(value) {
    settings.engine = value;
    if (engineDropdown) engineDropdown.setValue(value);
    if (engineSettingDropdown) engineSettingDropdown.setValue(value);
    saveSettings();
  }

  /* ---------- 全球城市搜索：Open-Meteo / GeoNames ---------- */
  function currentCityLocation() {
    var saved = settings.cityLocation;
    if (saved && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude) &&
        Math.abs(saved.latitude) <= 90 && Math.abs(saved.longitude) <= 180) return saved;
    var legacy = CITIES.find(function (city) { return city.name === settings.city; }) || CITIES[0];
    return { name: legacy.name, latitude: legacy.lat, longitude: legacy.lon };
  }
  function cityRegion(city) {
    return [city.admin1, city.country].filter(function (part, index, parts) {
      return part && part !== city.name && parts.indexOf(part) === index;
    }).join(' · ');
  }
  function initCitySearch() {
    var root = $('cityDropdown'), input = $('citySearchInput'), menu = $('cityMenu'), status = $('citySearchStatus');
    var timer = null, controller = null, generation = 0, results = [], activeIndex = -1, composing = false;
    function invalidate() {
      clearTimeout(timer);
      if (controller) { controller.abort(); controller = null; }
      generation++;
    }
    function close() {
      invalidate();
      menu.hidden = true; root.classList.remove('open'); input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant'); activeIndex = -1;
    }
    function showResults(cities) {
      results = cities; activeIndex = -1; menu.innerHTML = ''; input.removeAttribute('aria-activedescendant');
      cities.forEach(function (city, index) {
        var item = document.createElement('li');
        item.className = 'custom-menu-item'; item.id = 'city-option-' + index;
        item.setAttribute('role', 'option');
        var current = currentCityLocation();
        item.setAttribute('aria-selected', String(city.latitude === current.latitude && city.longitude === current.longitude));
        var name = document.createElement('span'); name.className = 'city-result-name'; name.textContent = city.name;
        var region = document.createElement('span'); region.className = 'city-result-region'; region.textContent = cityRegion(city);
        item.appendChild(name); item.appendChild(region);
        item.addEventListener('mousedown', function (e) { e.preventDefault(); });
        item.addEventListener('click', function () { choose(index); });
        menu.appendChild(item);
      });
      menu.hidden = !cities.length; root.classList.toggle('open', !!cities.length);
      input.setAttribute('aria-expanded', String(!!cities.length));
    }
    function syncValue() {
      close();
      var city = currentCityLocation();
      input.value = city.name;
      status.textContent = cityRegion(city) || '支持中文、英文及当地城市名称';
    }
    function choose(index) {
      var city = results[index];
      if (!city) return;
      settings.city = city.name;
      settings.cityLocation = { name: city.name, latitude: city.latitude, longitude: city.longitude,
        country: city.country || '', admin1: city.admin1 || '', timezone: city.timezone || '' };
      syncValue(); input.focus(); close();
      saveSettings(); fetchWeather();
    }
    function search() {
      invalidate();
      var query = input.value.trim();
      showResults([]);
      if (Array.from(query).length < 2) {
        status.textContent = '输入至少 2 个字符，例如 北京、Tokyo、New York';
        return;
      }
      status.textContent = '正在搜索全球城市…';
      var requestId = generation;
      timer = setTimeout(function () {
        controller = new AbortController();
        var language = (navigator.language || 'en').split('-')[0];
        var api = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) +
          '&count=10&language=' + encodeURIComponent(language) + '&format=json';
        fetch(api, { signal: controller.signal }).then(function (response) {
          if (!response.ok) throw new Error('city search failed');
          return response.json();
        }).then(function (data) {
          if (requestId !== generation) return;
          var cities = (data.results || []).filter(function (city) {
            return Number.isFinite(city.latitude) && Number.isFinite(city.longitude);
          });
          showResults(cities);
          status.textContent = cities.length ? '选择城市；国家和地区可区分同名城市' : '未找到城市，请尝试英文名或其他拼写';
        }).catch(function (error) {
          if (requestId !== generation || error.name === 'AbortError') return;
          status.textContent = '城市搜索暂时不可用，请检查网络后重新输入';
        });
      }, 300);
    }
    input.addEventListener('focus', function () {
      closeAllCustomDropdowns();
      if (input.value === currentCityLocation().name) {
        showResults([currentCityLocation()]);
        status.textContent = '输入城市名称搜索全球城市';
      } else search();
    });
    input.addEventListener('input', function () { if (!composing) search(); });
    input.addEventListener('compositionstart', function () { composing = true; invalidate(); });
    input.addEventListener('compositionend', function () { composing = false; search(); });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!results.length || menu.hidden) return;
        activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : (activeIndex < 0 ? 0 : -1)) + results.length) % results.length;
        Array.prototype.forEach.call(menu.children, function (item, index) { item.classList.toggle('active', index === activeIndex); });
        input.setAttribute('aria-activedescendant', menu.children[activeIndex].id);
        menu.children[activeIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!menu.hidden && results.length) choose(activeIndex < 0 ? 0 : activeIndex);
        else search();
      } else if (e.key === 'Escape') { e.stopPropagation(); syncValue(); }
    });
    input.addEventListener('blur', function () { setTimeout(syncValue, 150); });
    var dropdown = { close: close, setValue: syncValue };
    customDropdowns.push(dropdown); syncValue();
    return dropdown;
  }

  /* ---------- 时钟 ---------- */
  function tickClock() {
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    $('clock').textContent = hh + ':' + mm;
    var week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
    $('dateText').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + week;
  }

  /* ---------- 天气：Open-Meteo 免费接口，不用 key ---------- */
  // WMO 天气代码 -> 中文 + 表情
  /* ---------- 天气图标：内联 SVG（stroke 线条风格），禁止使用 emoji ---------- */
  function wxSvg(inner) {
    return '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  var WEATHER_ICONS = {
    sun: wxSvg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    partly: wxSvg('<circle cx="9" cy="8" r="3.2"/><path d="M9 1.5v1.6"/><path d="M9 12.5v1.6"/><path d="M2.5 8h1.6"/><path d="M13.5 8h1.6"/><path d="m4.4 3.4 1.1 1.1"/><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 1) scale(0.72)"/>'),
    cloud: wxSvg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
    fog: wxSvg('<path d="M17.5 13H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 -2) scale(0.85)"/><path d="M3 18h9"/><path d="M6 21h12"/>'),
    drizzle: wxSvg('<path d="M17.5 13H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 -2) scale(0.85)"/><path d="m8 18-1 2"/><path d="m12 18-1 2"/><path d="m16 18-1 2"/>'),
    rain: wxSvg('<path d="M17.5 13H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 -2) scale(0.85)"/><path d="M8 17v3"/><path d="M12 17v3"/><path d="M16 17v3"/>'),
    snow: wxSvg('<path d="M17.5 13H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 -2) scale(0.85)"/><circle cx="8" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="18" r="1" fill="currentColor" stroke="none"/>'),
    storm: wxSvg('<path d="M17.5 13H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" transform="translate(0 -2) scale(0.85)"/><path d="M13 14 10 19h4l-1 4 4-6h-4l1-3Z" fill="currentColor" stroke="none"/>')
  };
  // WMO 天气代码 -> 中文 + SVG 图标键名
  function weatherInfo(code) {
    var map = {
      0: ['晴朗', 'sun'], 1: ['大部晴朗', 'partly'], 2: ['多云', 'partly'], 3: ['阴天', 'cloud'],
      45: ['有雾', 'fog'], 48: ['雾凇', 'fog'],
      51: ['毛毛雨', 'drizzle'], 53: ['毛毛雨', 'drizzle'], 55: ['毛毛雨', 'drizzle'],
      61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'],
      71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['雪粒', 'snow'],
      80: ['阵雨', 'rain'], 81: ['阵雨', 'rain'], 82: ['暴雨', 'storm'],
      95: ['雷阵雨', 'storm'], 96: ['雷阵雨伴冰雹', 'storm'], 99: ['雷阵雨伴冰雹', 'storm']
    };
    var item = map[code] || ['未知', 'partly'];
    return [item[0], WEATHER_ICONS[item[1]]];
  }

  function fetchWeather() {
    var city = currentCityLocation();
    $('weatherCity').textContent = city.name;
    $('weatherCity').title = cityRegion(city);
    var requestId = (fetchWeather._requestId || 0) + 1;
    fetchWeather._requestId = requestId;
    $('weatherTemp').textContent = '--';
    $('weatherDesc').textContent = '正在获取天气…';
    $('weatherDetail').textContent = '';
    var api = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.latitude +
      '&longitude=' + city.longitude +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto';
    fetch(api).then(function (r) { return r.json(); }).then(function (data) {
      if (requestId !== fetchWeather._requestId) return;
      if (!data || !data.current) throw new Error('empty');
      var cur = data.current;
      var info = weatherInfo(cur.weather_code);
      $('weatherTemp').textContent = Math.round(cur.temperature_2m);
      $('weatherIcon').innerHTML = info[1];
      $('weatherDesc').textContent = info[0];
      $('weatherDetail').textContent = '湿度 ' + (cur.relative_humidity_2m ?? '--') + '% · 风速 ' +
        (cur.wind_speed_10m ?? '--') + ' km/h';
    }).catch(function () {
      if (requestId !== fetchWeather._requestId) return;
      $('weatherDesc').textContent = '天气暂时不可用';
      $('weatherDetail').textContent = '请检查网络后点刷新按钮重试';
    });
  }

  /* ---------- 图标自动读取 ----------
     默认网站使用内置图标；其他网站依次尝试 Favicon.so、彩虹和网站自身的 favicon.ico。
     成功获取的图片缩放为最大 128px 的 PNG，保存在本地；再次打开时无需联网。
     每个来源最多等 5 秒，全部失败则显示首字母。缓存总量限制为 2MB。 */
  var FAVICON_CACHE_LIMIT = 2 * 1024 * 1024;
  var BUILTIN_FAVICONS = {
    'www.baidu.com': 'www.baidu.com.ico',
    'www.google.com': 'www.google.com.png',
    'www.douyin.com': 'www.douyin.com.ico',
    'www.doubao.com': 'www.doubao.com.png',
    'www.youtube.com': 'www.youtube.com.png',
    'grok.com': 'grok.com.svg',
    'gemini.google.com': 'gemini.google.com.png',
    'chat.deepseek.com': 'chat.deepseek.com.svg',
    'www.twitch.tv': 'www.twitch.tv.png',
    'aistudio.google.com': 'aistudio.google.com.png',
    'copilot.microsoft.com': 'copilot.microsoft.com.jpg',
    'dash.cloudflare.com': 'dash.cloudflare.com.png',
    'chatgpt.com': 'chatgpt.com.ico',
    'muse.ai': 'muse.ai.ico'
  };
  function faviconCandidates(url, refresh) {
    try {
      var site = new URL(url);
      if (site.protocol !== 'https:' && site.protocol !== 'http:') return [];
      var list = [
        'https://favicon.so/' + encodeURIComponent(site.hostname),
        'https://favicon.cccyun.cc/' + encodeURIComponent(site.hostname),
        site.origin + '/favicon.ico'
      ];
      var builtin = BUILTIN_FAVICONS[site.hostname];
      if (typeof builtin === 'string') {
        if (refresh) list.push('icons/sites/' + builtin);
        else list.unshift('icons/sites/' + builtin);
      }
      return list;
    } catch (e) { return []; }
  }
  function faviconSources(url) {
    var list = faviconCandidates(url);
    var domain = domainOf(url), cached = faviconCache[domain];
    if (cached && typeof cached === 'object' && list.indexOf(cached.source) >= 0 &&
        typeof cached.dataUrl === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(cached.dataUrl) &&
        cached.dataUrl.length <= 128 * 1024) {
      return [cached.dataUrl].concat(list);
    }
    if (cached && list.indexOf(cached) >= 0) {
      return [cached].concat(list.filter(function (source) { return source !== cached; }));
    }
    if (cached) {
      delete faviconCache[domain];
      storeSet('local', 'faviconCache', faviconCache);
    }
    return list;
  }
  function cacheFavicon(image, source, url) {
    var domain = domainOf(url);
    // 读取已缓存的图片无需重复写入，内置文件只保留路径。
    if (!domain || source.indexOf('data:') === 0) return true;
    if (source.indexOf('icons/sites/') === 0) {
      if (faviconCache[domain] !== source) {
        faviconCache[domain] = source;
        storeSet('local', 'faviconCache', faviconCache);
      }
      return true;
    }
    try {
      var canvas = document.createElement('canvas');
      var scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/png');
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 128 * 1024) return false;
      faviconCache[domain] = { source: source, dataUrl: dataUrl, updatedAt: Date.now() };
      var domains = Object.keys(faviconCache).filter(function (key) { return key !== domain; });
      domains.sort(function (a, b) {
        return ((faviconCache[a] && faviconCache[a].updatedAt) || 0) - ((faviconCache[b] && faviconCache[b].updatedAt) || 0);
      });
      while (JSON.stringify(faviconCache).length > FAVICON_CACHE_LIMIT && domains.length) {
        delete faviconCache[domains.shift()];
      }
      storeSet('local', 'faviconCache', faviconCache);
      return true;
    } catch (e) {
      // 网站自身未允许跨域读取时仍可显示图片；保留已有本地缓存。
      return false;
    }
  }
  function loadFavicon(list, callback) {
    var step = 0, done = false, timer = null, current = null;
    function clearAttempt() {
      clearTimeout(timer);
      if (current) { current.onload = null; current.onerror = null; current = null; }
    }
    function finish(image, source) {
      if (done) return;
      done = true;
      clearAttempt();
      callback(image, source);
    }
    function next() {
      if (done) return;
      clearAttempt();
      if (step >= list.length) { finish(null, null); return; }
      var source = list[step++];
      function attempt(allowRead) {
        var probe = new Image();
        current = probe;
        probe.referrerPolicy = 'no-referrer';
        if (allowRead) probe.crossOrigin = 'anonymous';
        probe.onload = function () {
          // 网站自身的 16px favicon 也是有效图标，不按尺寸拒绝。
          if (probe.naturalWidth > 0 && probe.naturalHeight > 0) finish(probe, source);
          else next();
        };
        probe.onerror = function () {
          if (allowRead) {
            probe.onload = null; probe.onerror = null;
            attempt(false);
          } else next();
        };
        probe.src = source;
      }
      timer = setTimeout(next, 5000);
      attempt(/^https?:/.test(source));
    }
    next();
    return function () { done = true; clearAttempt(); };
  }
  // 给名字挑一个柔和的底色（首字母兜底用）
  function letterColor(name) {
    var colors = ['#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#4f46e5'];
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  }
  function letterFallback(iconBox, name) {
    iconBox.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'letter';
    span.textContent = (name || '?').trim().charAt(0).toUpperCase();
    span.style.background = letterColor(name || '?');
    iconBox.appendChild(span);
  }
  function attachFavicon(iconBox, bookmark) {
    if (iconBox._cancelFavicon) iconBox._cancelFavicon();
    letterFallback(iconBox, bookmark.name);
    iconBox._cancelFavicon = loadFavicon(faviconSources(bookmark.url), function (image, source) {
      if (!image) return;
      image.alt = bookmark.name;
      image.draggable = false;
      iconBox.innerHTML = '';
      iconBox.appendChild(image);
      cacheFavicon(image, source, bookmark.url);
    });
  }

  /* ---------- 长按进入手机式编辑模式 ----------
     按住约 600ms 全墙进入编辑模式：全部书签显示删除角标并轻微抖动。
     提前松开、开始拖拽都会取消计时；长按后松开的那次点击不打开网站。 */
  function enterEditMode() {
    if (editMode) return;
    editMode = true;
    document.body.classList.add('editing');
    hideContextMenu();
    $('doneEditBtn').classList.remove('hidden');
  }
  function exitEditMode() {
    if (!editMode) return;
    editMode = false;
    document.body.classList.remove('editing');
    $('doneEditBtn').classList.add('hidden');
  }
  function cancelLongPress() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }
  function startLongPress(btn) {
    cancelLongPress();
    longPressFired = false;
    longPressTimer = setTimeout(function () {
      longPressTimer = null;
      longPressFired = true; longPressFiredAt = Date.now();
      btn.classList.remove('is-pressed');
      enterEditMode();
    }, 600);
  }

  /* ---------- 书签右键菜单 ----------
     只在书签上右键时出现，菜单项：编辑 / 在新标签页中打开 / 删除。 */
  function showContextMenu(index, x, y) {
    var menu = $('contextMenu');
    contextMenuIndex = index;
    menu.classList.remove('hidden');
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }
  function hideContextMenu() {
    $('contextMenu').classList.add('hidden');
    contextMenuIndex = -1;
  }
  function deleteBookmarkAt(index) {
    if (index < 0 || index >= bookmarks.length) return;
    var name = bookmarks[index].name;
    bookmarks.splice(index, 1);
    saveBookmarks().then(function () { toast('已删除 ' + name); });
  }

  /* ---------- 书签墙 ---------- */
  function renderBookmarks() {
    var grid = $('bookmarksGrid');
    grid.innerHTML = '';
    bookmarks.forEach(function (bm, index) {
      var btn = document.createElement('button');
      btn.className = 'bookmark';
      btn.draggable = false;
      btn.dataset.index = index;
      btn.title = bm.name + ' · ' + bm.url;

      var iconBox = document.createElement('span');
      iconBox.className = 'bookmark-icon';
      attachFavicon(iconBox, bm);
      var visual = document.createElement('span');
      visual.className = 'bookmark-visual';

      var nameEl = document.createElement('span');
      nameEl.className = 'bookmark-name';
      nameEl.textContent = bm.name;

      // 编辑模式下的删除角标：红色圆圈 + 白色 ×，仅编辑模式显示，点它直接删除
      var del = document.createElement('span');
      del.className = 'delete-badge';
      del.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      del.title = '删除';
      del.setAttribute('role', 'button');
      del.setAttribute('aria-label', '删除 ' + bm.name);
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteBookmarkAt(bookmarks.indexOf(bm));
      });

      // 抖动错峰：负延迟让每个图标一进编辑模式就立刻抖，相位各不相同
      btn.style.setProperty('--wobble-delay', (-((index * 0.073) % 0.34)) + 's');
      btn.style.setProperty('--wobble-duration', (0.28 + (index % 4) * 0.025) + 's');

      visual.appendChild(iconBox);
      visual.appendChild(del);
      btn.appendChild(visual);
      btn.appendChild(nameEl);
      btn.addEventListener('click', function () {
        if (longPressFired) { longPressFired = false; return; } // 长按后松开的那次点击不打开网站
        hideContextMenu();
        if (editMode) { openModal(bookmarks.indexOf(bm)); return; }
        window.open(bm.url, '_blank');
      });

      btn.addEventListener('pointerdown', function (e) { beginBookmarkPointer(e, btn, bm); });
      // 右键弹出自定义菜单；长按刚触发时不弹菜单（避免长按后又冒出菜单）
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (Date.now() - longPressFiredAt < 1500) return;
        showContextMenu(bookmarks.indexOf(bm), e.clientX, e.clientY);
      });

      grid.appendChild(btn);
    });
  }
  function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function layoutRect(node) {
    // offset 不含摇摆和正在播放的 FLIP，命中目标不会随着动画来回跳。
    var parentRect = node.offsetParent.getBoundingClientRect();
    return { left: parentRect.left + node.offsetParent.clientLeft + node.offsetLeft,
      top: parentRect.top + node.offsetParent.clientTop + node.offsetTop,
      width: node.offsetWidth, height: node.offsetHeight };
  }
  function animateBookmarkLayout(change, excludedNode) {
    var nodes = Array.prototype.slice.call($('bookmarksGrid').children).concat($('addBtn'));
    var before = nodes.map(function (node) { return { node: node, rect: node.getBoundingClientRect() }; });
    nodes.forEach(function (node) {
      if (node._moveAnimation) { node._moveAnimation.cancel(); node._moveAnimation = null; }
    });
    change();
    if (reducedMotion()) return;
    before.forEach(function (entry) {
      if (entry.node === excludedNode || !entry.node.isConnected) return;
      var after = entry.node.getBoundingClientRect();
      var dx = entry.rect.left - after.left, dy = entry.rect.top - after.top;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
      entry.node._moveAnimation = entry.node.animate([
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)' },
        { transform: 'translate3d(0,0,0)' }
      ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
  }
  function liveMoveBookmark(from, to) {
    var grid = $('bookmarksGrid');
    var tiles = Array.prototype.slice.call(grid.children);
    if (from < 0 || from >= tiles.length || to < 0 || to >= tiles.length || from === to) return;
    var movedNode = tiles.splice(from, 1)[0];
    tiles.splice(to, 0, movedNode);
    var moved = bookmarks.splice(from, 1)[0];
    bookmarks.splice(to, 0, moved);
    animateBookmarkLayout(function () { grid.insertBefore(movedNode, tiles[to + 1] || null); }, movedNode);
    tiles.forEach(function (node, index) { node.dataset.index = index; });
    draggingIndex = to;
  }
  function beginBookmarkPointer(e, btn, bm) {
    if (e.button !== 0 || !e.isPrimary || pointerDrag || settlingDrag || e.target.closest('.delete-badge')) return;
    var rect = layoutRect(btn);
    pointerDrag = { id: e.pointerId, btn: btn, bm: bm, startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      active: false, originalOrder: bookmarks.slice(), ghost: null, overDelete: false };
    btn.classList.add('is-pressed');
    startLongPress(btn);
  }
  function moveBookmarkPointer(e) {
    var drag = pointerDrag;
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) <= 8) return;
    if (!drag.active) {
      cancelLongPress();
      hideContextMenu();
      drag.active = true;
      drag.btn.classList.remove('is-pressed');
      drag.ghost = drag.btn.cloneNode(true);
      drag.ghost.classList.add('drag-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.removeAttribute('title');
      drag.ghost.tabIndex = -1;
      drag.ghost.style.width = drag.btn.offsetWidth + 'px';
      drag.ghost.style.height = drag.btn.offsetHeight + 'px';
      document.body.appendChild(drag.ghost);
      drag.btn.classList.add('drag-src');
      draggingIndex = bookmarks.indexOf(drag.bm);
      document.body.classList.add('dragging');
      $('deleteZone').setAttribute('aria-hidden', 'false');
      drag.capture = drag.btn.closest('.bookmarks-section');
      drag.capture.setPointerCapture(e.pointerId);
      var lift = reducedMotion() ? 1 : 1.08;
      drag.ghost.style.transform = ghostTransform(drag, lift);
      if (!reducedMotion()) drag.ghost.animate([
        { scale: String(1 / lift) }, { scale: '1' }
      ], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    e.preventDefault();
    if (!dragFrame) dragFrame = requestAnimationFrame(updateBookmarkDrag);
  }
  function ghostTransform(drag, scale) {
    return 'translate3d(' + (drag.x - drag.offsetX) + 'px,' + (drag.y - drag.offsetY) + 'px,0) scale(' + scale + ')';
  }
  function updateBookmarkDrag() {
    dragFrame = null;
    var drag = pointerDrag;
    if (!drag || !drag.active) return;
    var scrollStep = drag.y < 56 ? -12 : (drag.y > window.innerHeight - 56 ? 12 : 0);
    if (scrollStep) window.scrollBy(0, scrollStep);
    drag.ghost.style.transform = ghostTransform(drag, reducedMotion() ? 1 : 1.08);
    var zoneRect = $('deleteZone').getBoundingClientRect();
    drag.overDelete = drag.x >= zoneRect.left && drag.x <= zoneRect.right && drag.y >= zoneRect.top && drag.y <= zoneRect.bottom;
    $('deleteZone').classList.toggle('drag-over', drag.overDelete);
    if (!drag.overDelete) {
      var sectionRect = drag.capture.getBoundingClientRect();
      if (drag.x >= sectionRect.left - 12 && drag.x <= sectionRect.right + 12 && drag.y >= sectionRect.top - 12 && drag.y <= sectionRect.bottom + 12) {
        var nearest = draggingIndex, nearestDistance = Infinity, currentDistance = Infinity;
        Array.prototype.forEach.call($('bookmarksGrid').children, function (node, index) {
          var rect = layoutRect(node);
          var distance = Math.hypot(drag.x - rect.left - rect.width / 2, drag.y - rect.top - rect.height / 2);
          if (index === draggingIndex) currentDistance = distance;
          if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
        });
        if (nearest !== draggingIndex && nearestDistance + 10 < currentDistance) liveMoveBookmark(draggingIndex, nearest);
      }
    }
    if (scrollStep) dragFrame = requestAnimationFrame(updateBookmarkDrag);
  }
  function finishBookmarkPointer(e, cancelled) {
    var drag = pointerDrag;
    if (!drag || (e && e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    cancelLongPress();
    drag.btn.classList.remove('is-pressed');
    if (!drag.active) { pointerDrag = null; return; }
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = null; }
    if (!cancelled && e && e.clientX !== undefined) { drag.x = e.clientX; drag.y = e.clientY; updateBookmarkDrag(); }
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = null; }
    pointerDrag = null;
    suppressBookmarkClickUntil = Date.now() + 450;
    longPressFired = false;
    if (drag.capture.hasPointerCapture(drag.id)) drag.capture.releasePointerCapture(drag.id);
    if (cancelled) {
      var originalIndex = drag.originalOrder.indexOf(drag.bm);
      liveMoveBookmark(draggingIndex, originalIndex);
    }
    var deleted = !cancelled && drag.overDelete;
    if (deleted) {
      bookmarks.splice(draggingIndex, 1);
      animateBookmarkLayout(function () { drag.btn.remove(); });
      Array.prototype.forEach.call($('bookmarksGrid').children, function (node, index) { node.dataset.index = index; });
    }
    hideDeleteZone();
    settlingDrag = true;
    var destination = deleted ? null : layoutRect(drag.btn);
    var animation = drag.ghost.animate(deleted ? [
      { transform: drag.ghost.style.transform, opacity: 1 },
      { transform: ghostTransform(drag, .25), opacity: 0 }
    ] : [
      { transform: drag.ghost.style.transform },
      { transform: 'translate3d(' + destination.left + 'px,' + destination.top + 'px,0) scale(1)' }
    ], { duration: reducedMotion() ? 0 : 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    function complete() {
      drag.ghost.remove(); drag.btn.classList.remove('drag-src'); settlingDrag = false;
      if (!cancelled && (deleted || bookmarks.some(function (bm, index) { return bm !== drag.originalOrder[index]; }))) {
        storeSet('sync', 'bookmarks', bookmarks);
      }
      if (deleted) toast('已删除 ' + drag.bm.name);
    }
    animation.finished.then(complete, complete);
  }
  function hideDeleteZone() {
    draggingIndex = -1;
    document.body.classList.remove('dragging');
    var zone = $('deleteZone');
    if (zone) { zone.classList.remove('drag-over'); zone.setAttribute('aria-hidden', 'true'); }
  }
  function saveBookmarks() {
    return storeSet('sync', 'bookmarks', bookmarks).then(renderBookmarks);
  }

  /* ---------- 添加 / 编辑书签弹窗 ---------- */
  function openModal(index) {
    hideContextMenu();
    editingIndex = index;
    var isEdit = index >= 0;
    $('modalTitle').textContent = isEdit ? '编辑书签' : '添加书签';
    $('siteName').value = isEdit ? bookmarks[index].name : '';
    $('siteUrl').value = isEdit ? bookmarks[index].url : '';
    $('deleteBookmark').classList.toggle('hidden', !isEdit);
    $('modal').classList.remove('hidden');
    updateModalIconPreview();
    setTimeout(function () { $('siteName').focus(); }, 50);
  }

  /* 弹窗里的图标预览：按当前网址字段显示图标（缓存优先），网址无效时显示首字母 */
  function updateModalIconPreview() {
    var box = $('modalIconPreview');
    if (!box) return;
    var url = normaliseUrl($('siteUrl').value);
    var name = $('siteName').value.trim() || '?';
    attachFavicon(box, { url: url, name: name });
  }

  /* 同步图标：跳过缓存重新读取，成功后替换图片；失败时保留旧缓存。
     不保存书签、不关闭弹窗。 */
  function syncBookmarkIcon() {
    if (syncingIcon) return;
    var url = normaliseUrl($('siteUrl').value);
    var domain = url ? domainOf(url) : null;
    if (!domain) { toast('请先填写网址'); return; }
    var btn = $('syncIconBtn');
    var label = btn.querySelector('span');
    syncingIcon = true;
    btn.disabled = true;
    btn.classList.add('syncing');
    if (label) label.textContent = '同步中…';
    var preview = $('modalIconPreview');
    if (preview && preview._cancelFavicon) preview._cancelFavicon();
    loadFavicon(faviconCandidates(url, true), function (image, source) {
      syncingIcon = false;
      btn.disabled = false;
      btn.classList.remove('syncing');
      if (label) label.textContent = '同步图标';
      var sameSite = domainOf(normaliseUrl($('siteUrl').value)) === domain;
      if (image) {
        cacheFavicon(image, source, url);
        if (sameSite && preview) {
          image.alt = $('siteName').value.trim() || '?';
          image.draggable = false;
          preview.innerHTML = '';
          preview.appendChild(image);
        }
        toast('图标已同步');
      } else {
        if (sameSite) updateModalIconPreview();
        toast(faviconCache[domain] ? '同步失败，已保留原图标' : '同步失败，已显示首字母图标');
      }
    });
  }
  function closeModal() { $('modal').classList.add('hidden'); editingIndex = -1; }

  function saveModal() {
    var name = $('siteName').value.trim();
    var url = normaliseUrl($('siteUrl').value);
    if (!name) { toast('请填写名称'); return; }
    if (!url || !domainOf(url)) { toast('网址格式不对，试试 https:// 开头'); return; }
    if (editingIndex >= 0) {
      bookmarks[editingIndex] = { name: name, url: url };
    } else {
      bookmarks.push({ name: name, url: url });
    }
    saveBookmarks().then(function () {
      closeModal();
      toast('已保存');
    });
  }

  /* ---------- 搜索 ---------- */
  function doSearch(e) {
    if (e) e.preventDefault();
    var q = $('searchInput').value.trim();
    if (!q) return;
    var engine = SEARCH_ENGINES[settings.engine] || SEARCH_ENGINES.google;
    // 输入像 example.com 这样的网址时直接打开，不走搜索
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q) && !/\s/.test(q)) {
      window.open(normaliseUrl(q), '_blank');
    } else {
      window.open(engine.url + encodeURIComponent(q), '_blank');
    }
  }

  /* ---------- 壁纸 ---------- */
  function applyWallpaper() {
    var bg = $('bg');
    bg.style.filter = 'blur(' + settings.blur + 'px) brightness(' + settings.brightness + '%)';
    $('blurValue').textContent = settings.blur + 'px';
    $('brightnessValue').textContent = settings.brightness + '%';
    $('blurRange').value = settings.blur;
    $('brightnessRange').value = settings.brightness;
    storeGet('local', 'wallpaperData').then(function (dataUrl) {
      if (dataUrl) bg.style.backgroundImage = 'url("' + dataUrl + '")';
      else bg.style.backgroundImage = 'url("wallpaper.jpg")';
    });
  }

  /* ---------- 图标尺寸：写 --icon-size 变量，格子、图标、字号都跟着变 ---------- */
  function applyIconSize() {
    var size = settings.iconSize || 64;
    document.documentElement.style.setProperty('--icon-size', size + 'px');
    $('iconSizeValue').textContent = size + 'px';
    $('iconSizeRange').value = size;
  }

  /* ---------- 设置 ---------- */
  function applySettingsToUI() {
    if (engineDropdown) engineDropdown.setValue(settings.engine);
    if (engineSettingDropdown) engineSettingDropdown.setValue(settings.engine);
    if (cityDropdown) cityDropdown.setValue(settings.city);
  }
  function saveSettings() {
    return storeSet('sync', 'settings', settings);
  }

  /* ---------- 设置面板（屏幕正中横向矩形弹窗，带遮罩） ---------- */
  function openSettings() {
    hideContextMenu();
    $('settingsPanel').classList.remove('hidden');
    $('settingsBackdrop').classList.remove('hidden');
  }
  function closeSettingsPanel() {
    $('settingsPanel').classList.add('hidden');
    $('settingsBackdrop').classList.add('hidden');
  }

  /* ---------- 初始化 ---------- */
  function init() {
    tickClock();
    setInterval(tickClock, 1000);

    // 搜索引擎下拉菜单，以及支持全球地理编码的天气城市搜索。
    var engineOptions = Object.keys(SEARCH_ENGINES).map(function (key) {
      return { value: key, label: SEARCH_ENGINES[key].label };
    });
    engineDropdown = initCustomDropdown('engineDropdown', 'engineSelectBtn', 'engineMenu', 'engineSelectLabel',
      engineOptions, function () { return settings.engine; }, setEngine);
    engineSettingDropdown = initCustomDropdown('engineSettingDropdown', 'engineSettingBtn', 'engineSettingMenu', 'engineSettingLabel',
      engineOptions, function () { return settings.engine; }, setEngine);
    cityDropdown = initCitySearch();

    // 点页面空白处关闭所有下拉菜单
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.custom-select')) closeAllCustomDropdowns();
    });

    Promise.all([
      storeGet('sync', 'settings'),
      storeGet('sync', 'bookmarks'),
      storeGet('local', 'faviconCache')
    ]).then(function (results) {
      if (results[0]) settings = Object.assign({}, DEFAULT_SETTINGS, results[0]);
      if (Array.isArray(results[1])) bookmarks = results[1];
      if (results[2]) faviconCache = results[2] || {};
      applySettingsToUI();
      applyWallpaper();
      applyIconSize();
      renderBookmarks();
      fetchWeather();
    });

    // 搜索
    $('searchForm').addEventListener('submit', doSearch);

    // 天气
    $('weatherRefresh').addEventListener('click', function () { fetchWeather(); toast('天气已刷新'); });

    document.addEventListener('pointermove', moveBookmarkPointer, { passive: false });
    document.addEventListener('pointerup', function (e) { finishBookmarkPointer(e, false); });
    document.addEventListener('pointercancel', function (e) { finishBookmarkPointer(e, true); });
    document.addEventListener('lostpointercapture', function (e) { finishBookmarkPointer(e, true); });
    window.addEventListener('blur', function () { finishBookmarkPointer(null, true); });
    document.addEventListener('click', function (e) {
      if (Date.now() < suppressBookmarkClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    // 书签
    $('addBtn').addEventListener('click', function () { openModal(-1); });
    $('syncIconBtn').addEventListener('click', syncBookmarkIcon);
    $('saveBookmark').addEventListener('click', saveModal);
    $('cancelBookmark').addEventListener('click', closeModal);
    $('deleteBookmark').addEventListener('click', function () {
      if (editingIndex < 0) return;
      bookmarks.splice(editingIndex, 1);
      saveBookmarks().then(function () { closeModal(); toast('已删除'); });
    });
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
    // 点空白处退出编辑模式、关闭右键菜单
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.context-menu')) hideContextMenu();
      if (editMode && !e.target.closest('.bookmark') && !e.target.closest('#doneEditBtn') && !e.target.closest('.modal') && !e.target.closest('.settings-panel')) exitEditMode();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { finishBookmarkPointer(null, true); hideContextMenu(); exitEditMode(); closeAllCustomDropdowns(); closeModal(); closeSettingsPanel(); }
      if (e.key === 'Enter' && !$('modal').classList.contains('hidden')) saveModal();
    });

    // 设置面板（引擎和城市改用自定义下拉菜单，见 initCustomDropdown）
    $('settingsBtn').addEventListener('click', function () {
      if ($('settingsPanel').classList.contains('hidden')) openSettings();
      else closeSettingsPanel();
    });
    $('closeSettings').addEventListener('click', closeSettingsPanel);
    $('settingsBackdrop').addEventListener('click', closeSettingsPanel);
    // 编辑模式的“完成”按钮：退出编辑模式
    $('doneEditBtn').addEventListener('click', function () { exitEditMode(); });
    // 书签右键菜单：点菜单项执行对应操作，点菜单外、滚动、Esc 都关闭
    $('contextMenu').addEventListener('click', function (e) {
      var item = e.target.closest('[data-action]');
      if (!item) return;
      var idx = contextMenuIndex;
      hideContextMenu();
      if (idx < 0 || idx >= bookmarks.length) return;
      var action = item.dataset.action;
      if (action === 'edit') openModal(idx);
      else if (action === 'open') window.open(bookmarks[idx].url, '_blank');
      else if (action === 'delete') deleteBookmarkAt(idx);
    });
    window.addEventListener('scroll', hideContextMenu, true);
    $('blurRange').addEventListener('input', function () {
      settings.blur = parseInt($('blurRange').value, 10);
      applyWallpaper();
      saveSettings();
    });
    $('brightnessRange').addEventListener('input', function () {
      settings.brightness = parseInt($('brightnessRange').value, 10);
      applyWallpaper();
      saveSettings();
    });
    $('iconSizeRange').addEventListener('input', function () {
      settings.iconSize = parseInt($('iconSizeRange').value, 10);
      applyIconSize();
      saveSettings();
    });
    $('wallpaperInput').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('图片太大，请选 5MB 以内的'); return; }
      var nameEl = $('wallpaperFileName');
      if (nameEl) nameEl.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function () {
        storeSet('local', 'wallpaperData', reader.result).then(function () {
          applyWallpaper();
          toast('壁纸已更换');
        });
      };
      reader.readAsDataURL(file);
    });
    $('resetWallpaper').addEventListener('click', function () {
      storeSet('local', 'wallpaperData', null).then(function () {
        applyWallpaper();
        var nameEl = $('wallpaperFileName');
        if (nameEl) nameEl.textContent = '未选择任何文件';
        $('wallpaperInput').value = '';
        toast('已恢复默认壁纸');
      });
    });
    $('resetAll').addEventListener('click', function () {
      settings = Object.assign({}, DEFAULT_SETTINGS);
      bookmarks = DEFAULT_BOOKMARKS.slice();
      Promise.all([
        saveSettings(),
        saveBookmarks(),
        storeSet('local', 'wallpaperData', null),
        storeSet('local', 'faviconCache', {})
      ]).then(function () {
        faviconCache = {};
        var nameEl = $('wallpaperFileName');
        if (nameEl) nameEl.textContent = '未选择任何文件';
        $('wallpaperInput').value = '';
        applySettingsToUI();
        applyWallpaper();
        applyIconSize();
        fetchWeather();
        toast('已恢复全部默认');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
