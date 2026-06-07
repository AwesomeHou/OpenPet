# <img src="assets/brand/openpet-logo-master.png" alt="OpenPet logo" width="36" /> OpenPet：面向网页 AI 工具的动画伙伴

[![docs中文](https://img.shields.io/badge/docs-中文-blue)](README.zh-CN.md)
[![docs英文](https://img.shields.io/badge/docs-English-blue)](README.md)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

OpenPet 是一款浏览器扩展，为支持的 AI 聊天站点提供动画伙伴展示、站点绑定管理，以及快速回到当前会话标签页的能力。
它采用本地优先设计，宠物资产、绑定和界面偏好都保存在浏览器本地，适合长期使用和多站点管理。

## 快速导航

- [核心能力](#核心能力)
- [安装方式](#安装方式)
- [使用流程](#使用流程)
- [支持站点](#支持站点)
- [浏览器兼容](#浏览器兼容)
- [宠物格式](#宠物格式)
- [如何制作宠物](#如何制作宠物)
- [权限说明](#权限说明)
- [隐私](#隐私)
- [项目结构](#项目结构)
- [许可证](#许可证)

## 核心能力

- 在支持的 AI 聊天站点中展示动画伙伴
- 支持从本地 `.zip` 文件或文件夹导入宠物包
- 首次安装会自动预装官方宠物
- 支持多宠物管理与按站点绑定
- 支持 `DeepSeek`、`Doubao`、`ChatGPT`、`Gemini`
- 宠物资产、站点绑定和界面偏好都保存在浏览器本地

## 安装方式

选择一个适合你的渠道安装 OpenPet：

| 渠道 | 适合场景 |
| --- | --- |
| GitHub Releases | 获取最新发布包、离线安装、归档版本 |
| Chrome Web Store | Chrome 用户一键安装 |
| Edge Add-ons | Edge 用户一键安装 |

如果你从 GitHub Releases 安装，通常需要下载发布包并在浏览器中加载解压后的扩展目录；如果从应用商店安装，直接点击安装即可。

## 使用流程

1. 安装 OpenPet 并在浏览器中固定扩展入口。
2. 打开支持的 AI 聊天站点，例如 DeepSeek、Doubao、ChatGPT 或 Gemini。
3. 在扩展中导入宠物包，或使用首次安装预装的官方宠物。
4. 为站点绑定宠物，并在宠物管理视图中调整你的站点配置。
5. 回到会话页面，宠物会随站点状态展示在支持页面中。

## 支持站点

- DeepSeek: `https://chat.deepseek.com/`
- Doubao: `https://www.doubao.com/`
- ChatGPT: `https://chatgpt.com/`
- Gemini: `https://gemini.google.com/`

## 浏览器兼容

OpenPet 基于 Chrome 扩展 Manifest V3 开发，因此可以在以下桌面浏览器中使用：

- Chrome
- Edge
- 其他兼容 Chromium 扩展的浏览器

如果浏览器支持安装未打包扩展，并兼容 Manifest V3，通常也可以加载这个项目的 `dist/` 产物。

## 宠物格式

OpenPet 使用与 Codex pets 兼容的宠物包格式。一个宠物通常包含两部分：

- `pet.json`：宠物元数据，包含 `id`、`displayName`、`description` 和 `spritesheetPath`
- `spritesheet.webp`：宠物动画精灵图。当前文档按 Codex pet 风格将其视为一张动作图集，atlas 行 `0~8` 共 9 行，分别对应 `idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`。

你导入到 OpenPet 的宠物包，本质上就是一个包含上述文件的本地宠物资源包。

## 如何制作宠物

如果你想自己制作 OpenPet 宠物，推荐使用 Codex 的 `hatch-pet` 技能：

1. 准备角色设定、品牌线索或参考图。
2. 使用 `hatch-pet` 技能生成基础宠物和各动作帧。
3. 通过技能自带的校验与联系表检查动画一致性。
4. 导出得到 `pet.json` 和 `spritesheet.webp`。
5. 将宠物包导入 OpenPet，即可在支持站点中使用。

如果你已有其他来源的宠物资产，也可以整理成 `pet.json + spritesheet.webp` 的结构再导入。

## 权限说明

OpenPet 当前请求以下权限：

- `storage`：用于保存宠物、绑定、设置和缓存状态
- `unlimitedStorage`：用于降低导入较大宠物资源时触发本地配额失败的概率
- `tabs`：用于点击宠物后聚焦到正确的会话标签页
- 受支持站点的页面访问权限：用于检测页面状态并渲染浮层

这些权限只用于扩展本体的本地工作流，不意味着 OpenPet 会把你的聊天内容上传到它自己的服务端。

## 隐私

OpenPet 以本地存储为优先。

- 不需要云账号
- 不需要把聊天内容发送到 OpenPet 服务端
- 宠物资产、绑定和界面偏好都保存在浏览器本地

正式隐私政策分为两版：

- 中文版：[`scratch/openpet-privacy-policy.zh-CN.md`](scratch/openpet-privacy-policy.zh-CN.md)
- 英文版：[`scratch/openpet-privacy-policy.en.md`](scratch/openpet-privacy-policy.en.md)

## 项目结构

```txt
openpet/
  assets/                      # 仓库级品牌与共享图片资源
    brand/                     # 品牌素材，如 Logo、横幅等
    icons/                     # 图标资源
  apps/                        # 应用入口目录
    chrome-extension/          # 浏览器扩展源码
  packages/                    # 共享逻辑与宠物资源工具
  scripts/                     # 构建与辅助脚本
  dist/                        # 浏览器实际加载的构建产物
  scratch/                     # 发布文案、说明草稿和规划记录
  README.md                    # 英文版文档
  README.zh-CN.md              # 中文版文档
  LICENSE                      # 开源许可证
```

## 许可证

MIT
