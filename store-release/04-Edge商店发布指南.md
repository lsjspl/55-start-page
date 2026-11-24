# 55起始页 — Microsoft Edge 商店发布指南

核对日期：2026 年 11 月 24 日。以下步骤依据 Microsoft 官方文档和本项目 1.0.21 的代码、清单与素材整理。

## 1. 注册 Edge 扩展开发者

进入 [Microsoft Edge 开发者后台（Partner Center）](https://partner.microsoft.com/dashboard/microsoftedge/public/login)。

使用个人 Microsoft 账号登录并注册 **Microsoft Edge** 计划。微软说明，Edge 扩展开发者注册不收取注册费。个人开发者通常选择 **Individual（个人）**，填写真实所在国家/地区、发布者名称及联系方式，阅读并接受开发者协议，然后等待账号验证完成。如果登录后没有注册表单，在 **Account settings → Programs → Microsoft Edge → Get started** 中进入。

注册时的国家/地区与账号类型选定后不能自行更改，按实际情况填写。工作或学校账号不能直接用作该计划的注册账号。

## 2. 先在 Edge 中加载验证

1. 在 Edge 地址栏输入 `edge://extensions`。
2. 开启 **开发人员模式（Developer mode）**。
3. 点击 **加载解压缩的扩展（Load unpacked）**，选择本项目的 `src/` 文件夹。
4. 打开新标签页。若 Edge 显示新标签页被更改的确认提示，确认保留更改，并检查扩展处于启用状态。
5. 检查搜索引擎切换、全球城市搜索及天气、书签新增/编辑/拖拽/删除、图标同步、壁纸选择和设置保存。
6. 在图标读取成功后断网重开新标签页，检查内置与已缓存的书签图标仍可显示。天气和城市搜索依赖联网。

本项目使用 Manifest V3、`chrome.storage` 和标准新标签页覆盖声明；Edge 支持这些功能，`chrome.*` API 名称可保留。清单没有 `update_url`，名称及短说明中也没有 Chrome 品牌字样，不需要为首次 Edge 上传另改清单。这是静态兼容性检查，以上实际 Edge 验证仍需完成。

## 3. 直接使用现有包与素材

以下路径相对于项目根目录：

| 后台用途 | 文件或地址 | 已核对内容 |
| --- | --- | --- |
| Packages / 扩展包 | `dist/55-start-page-1.0.21.zip` | 顶层包含 `manifest.json`，版本为 1.0.21，共 23 个文件 |
| Extension logo / 扩展徽标 | `store-release/icon512.png` | 512×512，透明 PNG；微软建议 300×300，最低 128×128，要求正方形 |
| Screenshots / 截图 | `store-release/screenshot-1280x800.png` | 1280×800，无透明通道 |
| Privacy Policy URL / 隐私政策 | https://lsjspl.github.io/55-start-page/ | 核对时 HTTP 200，可访问 |
| Website / 网站 | https://github.com/lsjspl/55-start-page | 项目说明与源码 |
| Support contact detail / 支持 | https://github.com/lsjspl/55-start-page/issues | 用户反馈入口 |

Edge 的徽标与截图是在商店详情页单独上传，不需要放入扩展 ZIP。截图最多 6 张，支持 640×480 或 1280×800。440×280 小型宣传图和 1400×560 大型宣传图是可选素材，首次发布可不填。

## 4. 创建商品并填写基础信息

在 Partner Center 的 **Edge** 工作区点击 **Create new extension**，上传上述 ZIP。

| 页面 / 字段 | 建议填写 |
| --- | --- |
| Availability → Visibility | Public（公开） |
| Availability → Markets | 按计划选择市场；面向所有可用市场时保留默认选择 |
| Properties → Category | Productivity（生产力；按后台提供的对应类别选择） |
| Properties → Website | 上表项目仓库地址 |
| Properties → Support contact detail | 上表 Issues 地址，或你希望公开的支持邮箱 |
| Store listings → Language | 简体中文；本项目目前的界面是简体中文 |
| Extension name | 55起始页；从清单的 `name` 读取 |
| Short description | 精美的新标签页：搜索、天气、书签墙、壁纸，书签图标自动读取。；从清单的 `description` 读取 |
| Extension logo | 上传 `icon512.png` |
| Screenshots | 上传 `screenshot-1280x800.png` |
| Search terms | 起始页、新标签页、书签、天气、壁纸、搜索、效率；每项分别添加，最多 7 项 |

如果后台默认显示其他语言，可按后台的 **Add a language** 功能添加简体中文并填写相应详情。仅填写你实际提供的语言，不宣称英文界面。

## 5. 详细说明，可复制

微软要求每个语言的详细说明长度在 250 到 10,000 字符之间。以下文案明确说明新标签页的更改，并按照当前实现描述功能：

```text
「55起始页」是一款适用于 Microsoft Edge 的自定义新标签页扩展。安装并启用后，它会将浏览器的新标签页替换为起始页，集中显示搜索、时钟、日期、天气、常用网站书签和壁纸。无需注册或登录扩展账号，即可开始使用。

主要功能：
• 多引擎搜索：在起始页中选择 Google、百度或 Bing，输入关键词后打开相应搜索结果；输入网站地址可直接访问网站。
• 实时天气：按名称搜索全球城市，选择城市后显示当前温度、天气状况、湿度与风速，数据来自 Open-Meteo。
• 书签管理：添加、编辑、删除常用网站，拖拽调整顺序，并使用右键菜单或编辑窗口进行管理。
• 网站图标：默认的 14 个网站图标随扩展提供；新增网站自动获取图标，支持手动同步。成功读取的图片会缓存，后续可在本地显示；读取失败时使用首字母占位。
• 个性化外观：从本机选择壁纸图片，调整壁纸模糊度、亮度与书签图标尺寸，并随时恢复默认设置。
• 时钟与日期：在页面上显示当前时间和日期。

数据与隐私：书签、设置、壁纸和图标缓存在浏览器存储中保存；书签和部分设置可能随浏览器账号同步，取决于你的浏览器设置。天气服务接收所选城市名称或城市坐标，图标服务接收对应网站域名。使用搜索时，关键词会交给你选择的搜索引擎。扩展不包含广告或统计追踪代码，不读取浏览器历史记录。完整隐私政策见商店提供的链接。

天气、城市搜索及未缓存图标的获取需要网络连接。你可以在 Edge 的扩展管理页面停用或卸载扩展，恢复浏览器的新标签页。
```

## 6. Privacy / 隐私页面

### Single Purpose Description / 单一用途

```text
Provides a customizable new tab page for Microsoft Edge, with search, a clock, weather for a user-selected city, website shortcuts, and a locally selected wallpaper. Enabling the extension replaces the browser's new tab page.
```

### Permission justification / 权限理由

按后台从清单列出的权限逐条填写：

| 权限 | 可复制的英文说明 |
| --- | --- |
| `storage` | Stores user-created website shortcuts, the selected search engine, weather city and appearance settings in browser storage. Shortcut and settings data use browser sync storage; wallpaper images and favicon images use local storage. The developer does not operate a server that receives these stored records. |
| `https://favicon.so/*` | Retrieves favicon images for user-created website shortcuts and manual icon refreshes. Only the website hostname is sent. Default shortcut icons are bundled, and successfully fetched images are cached locally. |
| `https://favicon.cccyun.cc/*` | Provides a fallback favicon image when Favicon.so fails. Only the website hostname is sent. Successfully fetched favicon images are cached locally for subsequent use. |
| `https://api.open-meteo.com/*` | Retrieves current weather for the city selected by the user. Requests contain that city's latitude and longitude, not a device GPS location. |
| `https://geocoding-api.open-meteo.com/*` | Searches for cities by a user-entered city name so the user can choose a city for the weather widget. |

### Are you using remote code? / 是否使用远程代码

选择 **No, I am not using remote code**。本项目的 JavaScript 和样式随扩展打包，网络获取的是天气数据、城市数据和图标图片。

### Data usage / 数据使用

按表单对数据类型的实际定义填写，并与隐私政策一致。本项目不读取浏览器历史记录、密码、支付信息，也不请求设备 GPS 定位；但会处理用户选择的城市及城市坐标，并为图标服务发送用户添加的网站域名，搜索操作会打开包含关键词的搜索引擎链接。若后台列出“位置”等涵盖这些数据的数据类型，需按对应定义披露；网站域名用于图标读取，也要在相关说明中写明，不能笼统声明完全没有网络数据传输。

对数据用途的说明可使用：

```text
Weather requests send the user-selected city name or that city's coordinates to Open-Meteo. Favicon requests send website hostnames to Favicon.so or favicon.cccyun.cc, with the site's favicon.ico as a fallback. Search actions open the selected search provider with the user's query. The extension does not read browsing history, request device geolocation, sell user data, or include advertising or analytics code. Website shortcuts and settings may sync through the browser account; wallpaper and favicon images stay in local browser storage.
```

Privacy Policy URL 填：`https://lsjspl.github.io/55-start-page/`。该页面是本项目自己的隐私政策，`chrome.storage` 是 Edge 也支持的 API 名称。

## 7. 审核备注，可复制

完成第 2 节实际验证后，可在 **Notes for certification** 中填写：

```text
No sign-in, subscription, purchase, or test credentials are required.

Enable the extension and open a new tab. The extension replaces the new tab page with a customizable start page. If Microsoft Edge asks whether to keep the new tab change, keep the change and verify that the extension is enabled.

Test steps:
1. Switch the start-page search provider to Bing and search for a keyword.
2. Open Settings, search for a city, select a result, and verify current weather.
3. Add a website shortcut, edit it, drag it to reorder, and refresh its icon.
4. Select a local wallpaper image and adjust brightness, blur and icon size.
5. Reopen a new tab and verify saved preferences.

Weather and city lookup require access to Open-Meteo. Uncached website icons require network access; bundled and successfully cached icons remain available offline. The interface is in Simplified Chinese. The extension does not change the browser address-bar search provider.
```

检查各页面提示并保存后，点击 **Publish** 提交审核。微软说明认证可能需要最多 7 个工作日；以后台实际状态为准。通过后状态变为 **In the Store**，可从扩展概览复制公开安装链接。

Chrome 和 Edge 是两个独立商店，不会因 GitHub 推送或 Chrome 发布而自动同步。首次 Edge 上传可以使用 1.0.21；后续更新时，新包的清单版本必须高于 Edge 该商品此前已上传/发布的版本。更新上传同一商品，不要重复创建商品。

## 官方资料

- [注册 Microsoft Edge 扩展开发者](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account)
- [发布 Microsoft Edge 扩展与素材要求](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension)
- [将 Chrome 扩展移植到 Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/port-chrome-extension)
- [Edge 支持的扩展 API](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/api-support)
- [在 Edge 中加载本地扩展](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)
- [Microsoft Edge 扩展开发者政策](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)
