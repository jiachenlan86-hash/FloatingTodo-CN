# 浮待 Todo V1.3

一个面向 Windows 的中文悬浮待办工具。按全局快捷键框选聊天、订单或工作消息，软件会离线识别中文，整理成可编辑的结构化待办，并保留原截图。

## 已实现

- iOS Liquid Glass 风格悬浮窗口：iOS 字体栈、Windows 11 Acrylic/Mica 真背景模糊、分层玻璃和高光折射
- 默认“绿色办公”主题，可切换“极简灰”或选择任意自定义主题色；按钮、开关、标签与高光会自动生成协调色
- 单层 14px 小圆角窗口轮廓；设置页铺满窗口，避免系统与内容出现两层圆角
- 无边框窗口，可拖动、缩放、置顶、隐藏到系统托盘
- Windows 登录时启动（安装版）
- 全局快捷键截图，默认 `Ctrl + Shift + A`，支持多显示器
- 优先调用本机 Umi-OCR，失败时自动使用 Windows 内置简体中文 OCR
- 无 AI 时用本地规则识别标题、相对/绝对日期、优先级和分类
- 内置 DeepSeek 与 OpenAI 预设，也支持其他兼容 Chat Completions 接口
- 截图后先确认、修改或拆分，再加入待办
- 今天 / 本周 / 以后 / 等待他人 / 已完成五个分区
- 本地 SQLite 数据库；截图作为本地附件保存
- API Key 使用 Electron 的系统安全存储能力加密后保存在本机

## 直接使用

在 `outputs/windows` 中：

- `FloatingTodo-1.3.0-x64-portable.exe`：便携版，双击运行
- `FloatingTodo-1.3.0-x64-setup.exe`：带安装向导，可选择安装目录并创建快捷方式

第一次运行后，应用会在系统托盘保留图标。关闭主窗口只是隐藏，托盘菜单可以重新打开或退出。

## 中文 OCR

V1 开箱即可尝试 Windows 内置 OCR。若系统未安装简体中文语言包，请在 Windows 设置的“时间和语言”中添加中文。

推荐安装 [Umi-OCR](https://github.com/hiroi-sora/Umi-OCR/releases/latest) 获得更好的复杂排版中文识别：

1. 启动 Umi-OCR。
2. 在 Umi-OCR 的全局设置中启用 HTTP 服务（默认端口 `1224`）。
3. 打开浮待 Todo 设置，保留“自动”识别方式并点击“测试 Umi-OCR”。

Umi-OCR 接口默认是 `http://127.0.0.1:1224/api/ocr`。所有图片数据只在本机回环地址传输。

## 可选 AI

不配置 AI 也能使用完整的截图、OCR、规则整理和待办管理功能。

若需要更准确地拆解自然语言，可在设置中启用 AI：

- DeepSeek：服务商选择“DeepSeek（中文推荐）”，软件会自动填写 `https://api.deepseek.com`、Chat Completions 和 `deepseek-v4-flash`，再填入 API Key 并点击测试。
- OpenAI 官方接口：选择 Responses API，地址 `https://api.openai.com/v1`。
- 其他兼容服务：可选择 Chat Completions 并填写服务商提供的地址和模型名。

启用 AI 时只发送 OCR 后的文字，不发送原截图。DeepSeek 接入参考其[官方 API 文档](https://api-docs.deepseek.com/)，OpenAI 接入使用 Responses API。

## 液态玻璃

- 设置 → 窗口与外观 → “主题风格”可选择绿色办公、极简灰或自定义颜色。
- 选择“自定义颜色”后只需挑选一个主题色，软件会自动匹配深色按钮、浅色选中态、开关和高光阴影。
- 设置 → 窗口与外观 → “玻璃效果”选择“透明液态玻璃”。
- “玻璃浓度”可从 12% 超清透调到 82% 强着色；这是玻璃底色强度，不会让文字一起变透明。
- Windows 11 22H2 及以上启用系统 Acrylic/Mica 材质；旧版 Windows 自动使用普通半透明兼容效果。
- 为保持可读性，主窗口、任务卡片和按钮使用不同厚度的玻璃层，鼠标移动时会有轻微高光变化。
- 设置页采用固定标题栏、独立滚动内容区和固定底部操作栏，不会再遮挡 AI 配置。

## 从源码运行

需要 Windows 10/11、Node.js 22 或更高版本：

```powershell
pnpm install
pnpm test
pnpm start
```

构建便携版和安装版：

```powershell
pnpm dist
```

## 数据位置

任务数据库和截图附件位于 Electron 的应用数据目录（通常在 `%APPDATA%\浮待 Todo`）。卸载软件不会主动删除这些个人数据。

## 隐私说明

- SQLite、设置和截图默认只保存在本机。
- Umi-OCR 与 Windows OCR 都在本机运行。
- 只有用户主动启用 AI 后，OCR 文字才会发送到用户配置的 API 地址。
- API Key 不会出现在界面回读值或日志中。

## V1.3 范围

当前版本聚焦 Windows 和单机使用，暂不包含云同步、账号系统、提醒通知和自动更新。源码采用 MIT 许可证。

