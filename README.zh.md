# TxHermesTranslateMessage — Translate Guard

**自动翻译 Hermes Agent 发出的消息 —— 你用母语写，对方用他的语言读。**

Translate Guard 是 Hermes Agent 的一个插件（Agent 端与桌面端合为一个包）：在发送前，它把输入框里的草稿依次交给多个公共翻译引擎处理。对话中保存的是译文，原文随时可以取回，编辑框中还可以在两者之间切换。

> [English](README.md) · [Русский](README.ru.md) · **中文**

---

## 功能

| 位置 | 行为 |
|---|---|
| 输入框（发送按钮右侧的 **▾**） | 菜单：**自动翻译**开关 + 目标语言（English / 中文） |
| 发送 | 草稿经引擎级联翻译后发出，对话中显示译文 |
| 编辑框 | 其发送按钮旁出现翻译图标，点击可在原文与译文之间切换 |
| 设置 ▸ 插件 ▸ Translate Guard | 同步开关与语言，显示引擎的实时状态（熔断器） |

默认状态：**自动翻译开启**，目标语言为**英语**。中文一键可切；设置页里还能**清除翻译缓存**。

## 安装

### 在桌面应用中安装（推荐）

1. 复制仓库链接：

   ```
   https://github.com/syntaxerror64/TxHermesTranslateMessage
   ```

2. 打开 Hermes Agent 的 **能力 ▸ 插件**（或 **设置 ▸ 插件**）。
3. 把链接粘贴到插件的**导入**输入框并确认。
4. 安装完成后启用 **Translate Guard**。

应用会自动克隆仓库、做安全扫描，并把两半作为**一条**插件记录安装。

### 通过命令行安装

```bash
hermes plugins install https://github.com/syntaxerror64/TxHermesTranslateMessage
hermes plugins enable translate-guard
```

然后重启应用，或执行 **⌘K → Reload desktop plugins**，让桌面端部分完成物化（materialize）。

## 使用

- 输入框里，发送按钮右侧就是 **▾** 按钮。
- 点击它可打开/关闭**自动翻译**，或切换目标语言。
- 开启自动翻译后，输入的文字会在发送前被翻译，对话中保留的是译文。
- 发送之后，在**编辑框**里打开这条消息：发送按钮旁的翻译图标可在译文与原文之间切换。

## 翻译引擎

请求按级联顺序尝试，第一个响应的引擎获胜；失败的引擎在其退避窗口内被跳过：

1. **Google**（translate.google.com）
2. **Mozhi**（六个镜像）
3. **SimplyTranslate**
4. **Lingva**
5. **MyMemory**（免费额度有每日字符上限；额度错误会被识别，引擎进入暂停而不是让请求失败）

无需任何 API 密钥。设置页会显示是哪个引擎应答；成功的译文会缓存，重复发送同样的内容不再产生请求。缓存可在设置页手动清除。

## 隐私

发送的文本会传给实际应答的公共翻译引擎（Google、Mozhi、SimplyTranslate、Lingva 或 MyMemory）。除此之外不会有任何数据离开本机：没有账号、没有遥测、插件本身也不保存你的对话。如果某条消息不适合外部翻译，发送前关掉自动翻译即可。

## 插件结构

```
plugin.yaml              ← Hermes 插件清单
__init__.py              ← Agent 端入口（注册 dashboard API）
dashboard/manifest.json  ← API 声明（隐藏标签页，只提供 REST）
dashboard/plugin_api.py  ← FastAPI 路由：POST /translate（另有 /health、/engines、/cache/clear）
desktop/plugin.js        ← 桌面端：输入框菜单、发送中间件、编辑框切换、设置页
```

桌面端部分不需要手工复制：应用会把 `plugins/translate-guard/desktop/` 物化到自己的 `desktop-plugins/` 目录并写入 `.hermes-package.json` 标记 —— 正是它让插件在列表里保持**唯一一条**记录。

### HTTP API

`POST /api/plugins/translate-guard/translate`

```json
{ "text": "привет, как дела?", "to": "en" }
```

```json
{ "text": "hi, how are you?", "engine": "google", "ms": 412, "cached": false }
```

`GET /api/plugins/translate-guard/health` — 引擎熔断器状态。

`POST /api/plugins/translate-guard/cache/clear` — 清空翻译缓存，返回 `{"cleared": N}`。

## 环境要求

- 支持插件的 Hermes Agent（桌面应用或 CLI）。
- Python 3.10+（使用 Hermes 运行时，`httpx` 与 `fastapi` 已内置）。
- 能访问上面列出的翻译引擎。

## 常见问题

**菜单点不开。** 更新插件并执行 **⌘K → Reload desktop plugins**（或重启应用）。旧版本在触发器上有一个守卫，会阻止菜单打开。

**消息没有翻译就发出去了。** 插件采用 fail-open 策略：后端在超时内没有响应时，消息按原文发出并弹出提示。请确认 Hermes 后端在运行（它重启时桌面日志里会出现 `ECONNREFUSED 127.0.0.1:9119`），然后重试。

**更新插件后，清除缓存按钮返回 404。** 后端只在启动时挂载插件的路由，不会重新扫描已挂载的插件。更新后重启应用（或 Hermes 后端），新路由即可生效。

**翻译很慢或为空。** 某个引擎可能被限流或宕机，级联会跳过它继续下一个。设置页会显示哪些引擎处于异常状态。MyMemory 的免费每日额度消耗得最快。

## 卸载

```bash
hermes plugins remove translate-guard
```

如果应用留下了 `desktop-plugins/translate-guard/` 目录，删除它并重启。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。

---

[English version](README.md) · [Русская версия](README.ru.md)
