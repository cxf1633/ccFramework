# Framework

`assets/framework` 是项目内的通用框架层，负责沉淀与具体业务无关的基础能力。它不直接依赖 Holdem 业务、App 配置表或具体模块资源，业务侧应优先通过项目的 `app` facade 使用这些能力；确实需要直接访问底层能力时，可从 `Framework.ts` 暴露的聚合入口进入。

## 入口

框架聚合入口位于 `Framework.ts`：

```ts
import { Framework } from "db://assets/framework/Framework";

Framework.ResourcesMgr;
Framework.SceneMgr;
Framework.UIMgr;
Framework.MessageManager;
Framework.LanguageMgr;
```

当前入口暴露的能力包括：

- `ResourcesMgr`：资源、Bundle、Prefab、远程图片加载与缓存。
- `SceneMgr`：场景加载与 Bundle 场景预加载。
- `UIMgr`：注册式 UI 打开、关闭、预加载与层级管理。
- `EventManager`：基于 Cocos `Node` 的全局事件。
- `MessageManager`：本地消息总线，适合业务事件和服务端推送分发。
- `HttpManager`：简单 JSON GET/POST 请求封装。
- `LanguageMgr`：语言 JSON、贴图、Spine 资源加载与组件刷新。
- `StorageMgr`：`localStorage` 的轻量封装。
- `AesUtils` / `ZlibUtils`：AES 与压缩/解压辅助工具。

## 目录职责

```text
assets/framework
├── audio/      音频通道管理，支持 Cocos AudioSource 与微信原生音频后端
├── base/       基础类型，如 Singleton
├── event/      全局事件与本地消息总线
├── http/       XMLHttpRequest JSON 请求封装
├── i18n/       运行时多语言管理与 LanguageLabel/Sprite/Spine 组件
├── language/   框架语言 Bundle 资源，包含框架自己的语言 JSON
├── log/        带时间戳和颜色的日志封装
├── model/      运行时数据模型基类
├── res/        Bundle、resources、Prefab、远程资源加载
├── scene/      场景加载与预加载
├── storage/    本地存储封装
├── tools/      框架侧工具入口与框架语言 Excel
├── ui/         UI 层级、窗口生命周期、UIBase 基类
└── utils/      通用工具函数
```

## UI 系统

UI 系统由 `ui/UIManager.ts`、`ui/UIBase.ts` 和 `ui/UIDefines.ts` 组成。

`UIManager` 只认识通用配置结构，不导入业务 UI 表。业务层需要在启动阶段注入 UI 配置，然后通过注册 ID 打开：

```ts
Framework.UIMgr.init(UIConfigData);
await Framework.UIMgr.openById(UIID.HoldemMain, params);
Framework.UIMgr.closeById(UIID.HoldemMain);
```

运行时实例以注册 UIID 为唯一身份；层级只决定父节点和渲染顺序，不参与实例查找。同一 Prefab 注册为不同 UIID 时会得到相互独立的实例。

UI 层级从低到高为：

```text
Game -> UI -> PopUp -> Dialog -> Toast -> System -> Guide
```

其中 `Dialog` 层带排队语义，同一时间只展示一个强交互弹窗；`System` 层用于等待遮罩、重连遮罩、热更新进度等阻塞交互的系统 UI。

`UIManager` 直接绑定场景中的 UI 层级。当前项目的 `UIRoot.prefab` 使用 `UIRoot -> game/gui` 结构；缺少预定义层节点或层顺序错误时，初始化会失败并输出错误。

`UIBase` 是业务 UI 组件基类，提供：

- `onInit` / `onShow` / `onHide` / `onDispose` 生命周期。
- `present(params)`：在显示前写入参数，并在界面已显示时主动刷新 `onShow`。
- 子节点轻量索引：`getNode(name)`。
- 按节点名自动绑定按钮点击：按钮节点名匹配同名方法时自动注册。
- 手动按钮绑定：`registerButtonClick` / `registerButtonClicks`。
- 键盘事件开关：`setKeyboard(true | false)`。

## 资源系统

`res/ResManager.ts` 封装 Cocos 资源加载能力：

- `ensureBundle` / `loadBundle` / `releaseBundle`
- `loadFromBundle`
- `loadResources`
- `loadRemote`
- `loadResourcesImageAsync`
- `loadRemoteImageAsync`
- `loadPrefabFromBundle`
- `preloadPrefabFromBundle`
- `getCachedPrefabFromBundle`
- Prefab 缓存清理

Prefab 加载带缓存和并发加载合并。UI 预加载依赖这套缓存，系统 UI 如等待遮罩可以通过 `openPreloadedById` 同步实例化，减少快速网络响应导致的显示/关闭竞态。

## 多语言系统

多语言系统位于 `i18n/`，框架语言资源位于 `language/`。

核心规则：

- 语言 Bundle 名为 `language`。
- 业务语言 JSON 路径：`assets/resources/language/json/<lang>`。
- 框架语言 JSON 路径：`assets/framework/language/json/<lang>`。
- 加载顺序是业务 JSON 先加载，框架 JSON 后加载；同名 key 会被后加载的框架 JSON 覆盖。
- 支持短码归一化：`zh -> zh-cn`，`en -> en-us`。
- 请求不存在或不支持的语言时，会回落到默认语言 `en-us`。

常用接口：

```ts
Framework.LanguageMgr.setLanguage("zh-cn");
Framework.LanguageMgr.getLangByID("SOME_KEY");
Framework.LanguageMgr.loadJson("en-us");
Framework.LanguageMgr.loadTexture();
```

组件能力：

- `LanguageLabel`：绑定文本 key，支持 `%{key}` 参数替换，支持首字母保持原样/大写/小写。
- `LanguageSprite`：按当前语言切换 SpriteFrame。
- `LanguageSpine`：按当前语言切换 Spine 资源并恢复默认动画。
- `LanguagePack`：切换语言后刷新当前场景内的语言组件。

框架语言源文件为 `tools/i18n/FrameworkI18n.xlsx`，导出入口为 `tools/export-excel-json.bat`。

## 事件与消息

`event/EventManager.ts` 是基于 Cocos `Node` 的全局事件工具：

```ts
Framework.EventManager.on("event-name", this.onEvent, this);
Framework.EventManager.emit("event-name", data);
Framework.EventManager.off("event-name", this.onEvent, this);
```

`event/MessageManager.ts` 是本地消息总线，适合业务模块内部消息和服务端推送分发：

```ts
const off = Framework.MessageManager.on("message-type", this.onMessage, this);
Framework.MessageManager.dispatchMessage("message-type", payload);
off();
```

消息总线支持：

- `on`
- `once`
- `off`
- `removeAllListeners`
- `dispatchMessage`
- `getListenerCount`

网络请求响应不应自动进入本地消息总线；请求响应由调用方处理，服务端 push 再通过消息总线分发。

## 场景、HTTP、存储与日志

`SceneManager` 提供当前场景名、普通场景加载和 Bundle 场景预加载：

```ts
Framework.SceneMgr.getCurrentSceneName();
await Framework.SceneMgr.loadScene("main");
await Framework.SceneMgr.preloadScene("gameBundle", "gameScene");
```

`HttpManager` 是轻量 JSON 请求封装，提供 GET/POST 和同步 GET/POST。新业务如果需要更完整的错误码、重试、鉴权或取消能力，应在 app 层服务中封装，不建议把业务协议塞回 framework。

`StorageManager` 是 `localStorage` 的简单代理，提供 `getItem`、`setItem`、`removeItem`、`clear`、`key` 和 `length`。

`Logger` 提供可关闭的彩色日志：

- `log`
- `warn`
- `error`
- `netLog`
- `logJson`
- `setDebug`

## 音频系统

`audio/AudioManager.ts` 按 channel 管理音频播放：

- 初始化宿主节点：`initialize(hostNode)`
- 创建/删除 channel
- 设置 `AudioClip`
- 播放、暂停、恢复、停止、seek
- 设置音量和循环
- 一次性音效播放：`playOneShot`
- 停止所有音频与释放资源

音频后端支持：

- `cocos`：使用 Cocos `AudioSource`。
- `native`：使用微信 `InnerAudioContext`。
- `auto`：在微信小游戏/小程序环境下走原生音频，否则走 Cocos。

## 数据模型

`model/BaseModel.ts` 是运行时数据模型基类。模型层用于维护数据缓存，不直接操作 UI、场景或动画。业务模型应继承它并实现 `clear()`，例如牌桌、玩家、手牌等运行时数据缓存。

## 工具

`utils/` 当前包含：

- `AesUtils`：AES-CBC-PKCS7 加密/解密。
- `ZlibUtils`：字符串压缩、解压，以及 Base64 编解码 polyfill。
- `NumberFormatUtils`：筹码/数量格式化，支持 K/M/B 单位和小数格式控制。
- `NodePathUtils`：节点完整路径、相对路径、带同名下标路径生成，以及按路径查找子节点。

## 扩展原则

- framework 只放通用能力，不放 Holdem、Hall、支付、登录、活动等业务逻辑。
- framework 不应导入 app 层配置，例如 `UIID`、`UIConfigData`、业务网络 route 或业务数据类型。
- UI 打开应走注册 ID，不恢复直接路径打开作为业务常规 API。
- 资源和语言能力应保持 Bundle 边界清晰，避免把业务资源继续堆到全局 `resources`。
- 新增能力时优先保持小而稳定的 API；如果逻辑依赖具体产品规则，应放在 app 或 game 层。
