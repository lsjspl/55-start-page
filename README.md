# 55起始页（55 Start Page）

一个可高度自定义的 Chrome 新标签页扩展（Manifest V3）。打开新标签页即可使用搜索、天气、书签墙和壁纸，书签图标会自动读取。

- 商店名称：55起始页 / 55 Start Page
- 当前版本：1.0.20
- 隐私政策：https://lsjspl.github.io/55-start-page/

## 功能

- 多搜索引擎切换（Google / Bing / 百度 / 搜狗 / DuckDuckGo）
- 实时天气（Open-Meteo，支持城市搜索与 GPS 定位）
- 可拖拽排序的书签墙，支持新增、编辑、删除、图标同步
- 自定义壁纸、模糊度与亮度
- 所有设置与书签保存在本地 `chrome.storage`，不上传服务器

## 目录结构

```
55-start-page/
├── src/                      # 扩展源码（即打包进 zip 的内容，manifest 位于此层根）
│   ├── manifest.json         # 扩展配置（MV3）
│   ├── newtab.html           # 新标签页入口
│   ├── script.js             # 交互逻辑
│   ├── style.css             # 样式
│   ├── wallpaper.jpg         # 默认壁纸
│   └── icons/                # 扩展图标 16/48/128
├── dist/                     # 打包产物
│   └── 55-start-page-1.0.20.zip
├── tests/                    # 单元测试（Node 内置 test runner）
│   └── bookmark-drag.test.cjs
├── scripts/
│   └── build.py              # 从 src/ 生成 dist/ 压缩包
├── docs/                     # GitHub Pages 站点（隐私政策页面）
│   └── index.html
├── store-release/            # Chrome 商店发布素材
│   ├── 00-后台逐项照填.md     # 后台逐字段填写对照表
│   ├── 01-商店文案.md         # 名称/简介/详细描述/权限理由
│   ├── 02-隐私政策.html       # 隐私政策源文件（同步到 docs/）
│   ├── 03-发布操作清单.md     # 发布步骤与更新流程
│   └── screenshot-1280x800.png
├── package.json
└── .gitignore
```

## 本地开发

把 `src/` 目录直接加载到 Chrome 即可：

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目的 `src/` 目录

## 测试

使用 Node.js 内置测试运行器，无需安装依赖：

```bash
npm test
# 或
node --test tests/
```

## 打包

版本号取自 `src/manifest.json`，输出为 `dist/55-start-page-<版本>.zip`：

```bash
npm run build
# 或
python scripts/build.py
```

打包时以 `src/` 为归档根，确保 `manifest.json` 位于 zip 顶层（Chrome 扩展包要求）。

## 发布

Chrome 网上应用店的提交步骤、商店文案、权限理由和隐私政策链接见 `store-release/` 目录，从 `00-后台逐项照填.md` 开始。
