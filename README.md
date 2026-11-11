# Framework

`assets/framework` 是项目内的通用框架层，负责沉淀与具体业务无关的基础能力。它不直接依赖 Holdem 业务、App 配置表或具体模块资源，业务侧应优先通过项目的 `app` facade 使用这些能力；确实需要直接访问底层能力时，可从 `Framework.ts` 暴露的聚合入口进入。

## 入口

框架聚合入口位于 `Framework.ts`：

```ts
import { Framework } from "db://assets/framework/Framework";

Framework.ResourcesMgr;
Framework.AudioMgr;
Framework.SceneMgr;
Framework.UIMgr;
Framework.MessageManager;
Framework.LanguageMgr;
```

当前入口暴露的能力包括：

- `ResourcesMgr`：资源、Bundle、Prefab、远程图片加载与缓存。
- `AudioMgr`：基于 Cocos `AudioSource` 的音乐、音效、资源缓存、音量和静音状态管理。
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
├── audio/      基于 Cocos AudioSource 的音频通道、资源缓存与 UI 点击音效桥接
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
├── ui/         UI 层级、窗口生命周期、复用组件、材质效果、Tween 动画和异步辅助
│   ├── async/       依赖组件/节点生命周期的异步辅助
│   ├── components/  下拉框、滑条、虚拟列表、验证码、标签系统等复用组件
│   ├── materials/   UI Shader 与材质资源
│   └── tweenAnim/   声明式 Tween 动画组件
└── utils/      通用工具函数
```

## UI 系统

UI 系统由 `ui/UIManager.ts`、`ui/UIBase.ts`、`ui/UILayer.ts` 和 `ui/UIDefines.ts` 组成；可复用 UI 组件位于 `ui/components/`，依赖组件生命周期的异步辅助位于 `ui/async/`。

`UIManager` 只认识通用配置结构，不导入业务 UI 表。业务层需要在启动阶段注入 UI 配置，然后通过注册 ID 打开：

```ts
Framework.UIMgr.init(UIConfigData);
await Framework.UIMgr.openById(UIID.HoldemMain, params);
Framework.UIMgr.closeById(UIID.HoldemMain);
```

运行时实例以注册 UIID 为唯一身份；层级只决定父节点和渲染顺序，不参与实例查找。同一 Prefab 注册为不同 UIID 时会得到相互独立的实例。

默认所有 UI 都不排队；在异步加载期间，同一 UIID 的打开请求共享一个 Promise，并使用最新参数完成展示。只有配置了 `layer: UILayerType.Dialog, queue: true` 的请求才按队列逐个处理。加载完成前关闭 UIID 会取消当前挂载。

UI 层级从低到高为：

```text
Game -> UI -> PopUp -> Dialog -> Toast -> System -> Guide
```

其中 `Dialog` 层默认允许叠加显示，后打开的界面显示在上面。`queue` 默认是 `false`，仅在 Dialog 层生效；设为 `true` 时等待当前 Dialog 全部关闭后按队列打开。未启用排队的 Dialog 可以直接打开，不受队列阻塞。同步接口 `openPreloadedById` 对启用排队且队列忙碌的请求返回 `null`，需要排队等待时使用 `openById`。`System` 层用于等待遮罩、重连遮罩、热更新进度等阻塞交互的系统 UI。

`UIManager` 直接绑定场景中的 UI 层级。当前项目的 `UIRoot.prefab` 使用 `UIRoot -> game/gui` 结构；缺少预定义层节点或层顺序错误时，初始化会失败并输出错误。

`UIBase` 是业务 UI 组件基类，提供：

- `onInit` / `onShow` / `onHide` / `onDispose` 生命周期。
- `present(params)`：在显示前写入参数，并在界面已显示时主动刷新 `onShow`。
- 子节点轻量索引：`getNode(name)`。
- 节点路径：完整路径、相对路径、同名下标路径和按路径查找子节点。
- 按节点名自动绑定按钮点击：按钮节点名匹配同名方法时自动注册。
- 手动按钮绑定：`registerButtonClick` / `registerButtonClicks`。

通用 UI 组件位于 `ui/components/`。其中 `ui/components/effects/UIGradient.ts` 为
`Label`、`Sprite` 等 `UIRenderer` 提供横向或纵向双色渐变；默认材质位于
`ui/materials/gradient/ui-gradient.mtl`，由业务节点在 Inspector 中直接绑定，不需要运行时加载。
组件启用时为当前渲染器创建独立材质实例，业务代码可通过 `setColors(startColor, endColor)`
更新颜色，不会修改共享材质，也不会在运行时逐帧刷新材质属性。

`ui/materials/gradient/` 还包含流光、扫光、外发光、翻牌和灰度等 Shader/材质资源。
`BaseMaterrialController`、`FlashLightController`、`GradientController`、`PeekCardController` 和
`SpriteGlowOutterController` 是本次同步带入的配套控制器。`GradientController` 的材质需要在
Inspector 中显式绑定 `ui/materials/gradient/gradient.mtl`；`PeekCardController.setFace()` 会在运行时
注入牌面纹理，各控制器不依赖来源项目的日志模块。

### 通用 UI 组件

- `CaptchaView`：本地字符验证码绘制，也可展示服务端下发的 PNG Base64 图片；服务端模式通过 `setCode()`、`setServerImage()` 和 `setOnRequestNewCode()` 接入。
- `DropDown/Dropdown`：动态选项下拉框，支持运行时增删选项、共享 List、边界翻转、选中状态和变更回调。
- `FollowTarget`：按配置跟随目标节点的位置、旋转和缩放。
- `UIDragSource` / `UIDropTarget`：组合式拖放来源与接收区域，统一输入、命中检测和进入、离开、放下、结束、取消通知。配置见下文。
- `ProgressTimer`：圆形/半圆填充计时器，支持文字、颜色过渡和沿圆环移动的圆点。
- `SliderBar`：同步 `Slider`、`ProgressBar`、填充 Sprite 与数值文本，可动画设置进度。
- `UIStepSlider`：离散档位滑条，支持刻度、档位文本、填充尺寸同步和 `step-changed` 事件。
- `VirtualGridList`：基于 `ScrollView` 的网格虚拟列表，复用可见单元格，并提供边界与可见范围回调。
- `UIToggle` / `UIToggleGroup`：轻量页签组，支持选中/未选中节点以及一对一、一对多、多对多 Panel 映射。
- `ToggleVisibility`：根据原生 `Toggle` 状态切换两组节点的显隐。
- `UIClickSound`：为原生 `Button` / `Toggle` 接入框架点击音效和防连点；不要与 `UIButton` 挂在同一节点。
- `tagSystem/TagNode` / `TagGroup`：按字符串域和标签控制指定子树内节点显隐，多套标签系统互不干扰。

#### UIDragSource 与 UIDropTarget

物品业务、可拖动能力和接收能力分别挂组件，无需让业务类继承拖动基类。

UIDropTarget 在进入、移动时自动创建独立的半透明预览节点，图片只使用来源 UIDragSource 的 previewSpriteFrame（Inspector 中的 Preview Sprite Frame），未设置时不显示预览，透明度固定为128。预览位于 Hit Area 中心，离开、放下、禁用或销毁时清理，不修改目标的正式图片和动画。业务通过 accepts 校验接收条件。

1. 来源挂 `UIDragSource`，要求自身有 `UITransform`。`Create Instance` 默认关闭，拖动自身并保持抓取偏移；开启后优先使用 `Drag Prefab` 生成副本，否则使用 `Drag Sprite Frame` 生成图片副本。图片留空时读取当前节点 `Sprite.spriteFrame`，缺少可用资源时取消拖动。生成副本时来源保持原位，预制体副本根节点需要 `UITransform`。图片副本自动使用来源 Layer 和图片自然尺寸。
2. 副本的 `Drag Parent` 建议使用 Canvas 下无 Layout / Mask 的顶层空节点，留空使用最近的 Canvas。自身拖动保留原父节点，避免 Layout / Widget 自动改写位置。组件适用于常规 2D Canvas UI。
3. 接收区域挂 `UIDropTarget`。`Hit Area` 留空使用自身固定 UITransform 范围，不受子节点换图片影响。
4. 目标的 `Accepted Sources` 可拖入允许接收的来源节点；空列表不限制来源节点。业务还可设置 `target.accepts(context)` 校验，例如只接收当前刀或有图片的食材。
5. 来源的 `Drop Targets` 绑定具体目标组件时按数组顺序检测；留空使用当前场景登记的活动目标，按 Priority 从大到小检测，同优先级按登记顺序。`Target Root` 可以限定目标所属子树。

接收条件使用来源节点引用或业务组件判断，不依赖字符串分类。一个目标同时只由一个拖动来源占用。

`SackItem` 的 `itemId` 表示食材编号；袋子图片和来源的 `dragSpriteFrame` 在预制体中配置。砧板通过业务组件中的食物袋节点列表限定来源，接收时同步食材编号。

来源节点通知（`UIDragSource.EventType`）：

节点事件负责起拖，手势期间只暂停实际起触节点的系统事件，后续移动、松手和取消由 `input` 接收并依据 `event.type` 判断，结束时恢复节点并移除监听。业务使用下列统一通知，不依赖节点的 TOUCH_CANCEL 来推断是否真正取消。

- `DRAG_START`：超过起拖阈值并成功创建拖动物体后触发，轻点不触发。
- `DRAG_MOVE`：移动后触发，带当前命中目标或 null。
- `TARGET_ENTER / TARGET_LEAVE`：目标变化时触发。
- `DRAG_CANCEL`：触摸真正取消、组件禁用或进入后台等中断时触发。
- `DRAG_END`：每次已开始的拖动结束时触发一次，包含 cancelled、dropped。正常松手和取消均触发。
- `SOURCE_RESTORED`：自身复位后触发，参数为来源组件。

接收节点通知（`UIDropTarget.EventType`）：`ENTER / OVER / LEAVE / DROP`，参数均为 `UIDropContext`。正常命中松手顺序为 DROP → LEAVE → DRAG_END；取消只离开目标并复位，不触发 DROP。

业务监听写法（代码放在业务组件内部，导入路径按目录调整）：

```ts
import { UIDropTarget } from '../../framework/ui/components/UIDropTarget';
import type { UIDropContext } from '../../framework/ui/components/UIDragTypes';

protected onEnable(): void {
    this.node.on(UIDropTarget.EventType.ENTER, this.onDragEnter, this);
    this.node.on(UIDropTarget.EventType.LEAVE, this.onDragLeave, this);
}

protected onDisable(): void {
    this.node.off(UIDropTarget.EventType.ENTER, this.onDragEnter, this);
    this.node.off(UIDropTarget.EventType.LEAVE, this.onDragLeave, this);
}

private onDragEnter(context: UIDropContext): void {
    // 读取 context.sourceNode 上的业务组件，显示预览。
}

private onDragLeave(context: UIDropContext): void {
    // 清除预览。
}
```

上下文统一定义在 `UIDragTypes.ts`，包含 source、sourceNode、dragNode、target、targetNode、screenPosition、uiPosition、touchId、windowId 和 restoreSource。目标事件的 target/targetNode 非空；来源移动和结束事件可以为空。命中检测使用屏幕坐标，显示跟随使用 UI 坐标。

目标也提供 Inspector `Drop Events`，配置方式与 Button 相同，第一个参数为 UIDropContext，非空的 CustomEventData 为第二个参数。项目中的碗和砧板已使用代码监听，避免为同一行为再重复配置 Inspector 回调。

自身未命中、取消或回调异常时自动复位；命中后由业务接管，可在动画结束后调用 `context.restoreSource()`。副本默认在命中回调返回后销毁，关闭 Destroy On Drop 后由业务负责接管和销毁；副本未命中或取消始终销毁。回调均同步执行，默认销毁模式下不要在 await 之后继续操作副本。

`ui/components/UIRadarChart.ts` 依赖同节点的 `Graphics`，按传入的归一化数值绘制雷达图的
多边形数据区域。轴的数量和顶点位置由 `axisNodes` 决定：节点数量即多边形边数，每个节点的位置
代表该轴满格时的顶点，可以直接摆到外层网格切图的顶点上；未配置 `axisNodes` 时退化为按
`radius` 和 `startAngle` 均分计算。`centerNode` 指定数值为 0 时顶点收缩到的中心点，
可以直接摆到网格切图的中心上，留空则用组件节点自身的位置。外层网格、轴线和文字由业务节点用切图和 Label 摆放，
组件只画数据区域，通过多层描边叠出发光，并支持由中心向外的展开动画。

业务侧调用 `setValues(values, animated)` 刷新，`clear()` 清空。传入的是各轴原始数值，
组件按业务侧通过 `setAxisMaxValues(maxValues)` 传入的满格上限（按下标与 `axisNodes` 对应）
归一化，超出上限的部分顶格，某轴上限留空或 <= 0 时按 1 处理，即认为传入值已归一化。
数值的下标与 `axisNodes` 的下标一一对应，顺序由业务侧传入的数组保证。
数值刷新会从当前形状过渡到新形状，首次设置即表现为由中心展开。
`replayOnEnable` 默认开启，节点每次由隐藏变为显示时会把当前数值从中心重新展开一遍，
页签切换这类只切 `active` 的场景不需要业务侧再调一次 `setValues`；也可以手动调 `replay()` 重播。
满格上限不在 Inspector 里配置，只能由业务侧传入；编辑器预览的 `previewValues` 因此直接填 0~1 的归一化数值。
组件带 `@executeInEditMode`，在编辑器里按 `previewValues` 预览数据区域，美术可以直接调
颜色、描边和发光参数，`previewInEditor` 可关闭预览。`onLoad` 会校验轴节点是否有遗漏，
以及轴节点是否沿圆周依次排列（顺序错乱会导致多边形自交）；轴上限数量与轴节点不一致时，
`setAxisMaxValues` 会输出警告。

`ui/components/NumberRoller.ts` 为 `Label` 提供通用数值滚动。它维护独立的真实数值，
连续更新时从当前动画值重定向到新目标，并支持立即设置、停止、缓动配置及业务格式化函数；
金币缩写、货币符号等业务格式应通过 `setFormatter()` 注入，不放入框架组件。

`UILayer` 继承 `UIBase`，用于完整 UI 界面，并统一管理只在界面显示期间有效的键盘监听和秒级 Label 定时任务：

- 键盘事件开关：`setKeyboard(true | false)`。
- 秒级 Label 刷新：`startSecondLabel` / `stopSecondLabel`。
- 节点定位与移动：`setNodeToNode` / `moveNodeToNode`。
- 通用界面关闭：`btn_close()`。
- 界面重复展示、隐藏或销毁时自动清理输入监听和定时任务。

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

Prefab 加载由 `ResManager` 负责缓存和资源级并发合并。普通 UI 打开时会优先同步复用已缓存 Prefab，缓存未命中才进入异步加载；`openPreloadedById` 只允许同步实例化已缓存资源，适合等待遮罩等要求立即显示的系统 UI。

## 多语言系统

多语言系统位于 `i18n/`，框架语言资源位于 `language/`。

核心规则：

- 语言 Bundle 名为 `language`。
- 应用在启动前配置 `LanguageData.businessSources`，每项包含所属 `bundleName` 和目录 `path`；目录内 JSON 路径为 `json/<lang>`，图片路径为 `texture/<lang>`，Spine 路径为 `spine/<lang>`，无需将语言目录设为独立 Bundle。
- 项目公共语言 JSON 路径：`assets/modules/language/json/<lang>`（`language` Bundle）。
- 加载顺序是业务 JSON 先加载，框架 JSON 后加载；同名 key 会被后加载的框架 JSON 覆盖。
- 切换语言只释放旧语言目录内的资源，保留所属游戏 Bundle 及预制体默认引用的中文资源。
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

服务端推送需要在日志中携带协议号时，可传第三个可选参数：

```ts
Framework.MessageManager.dispatchMessage("message-type", payload, { main: 100, sub: 1001 });
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

当前音频后端统一使用 Cocos `AudioSource`。`AudioService.initialize()` 会同时向 `UIButton` 和
`UIClickSound` 注入点击音效播放器，`dispose()` 时解除桥接。

## 动画组件

`ui/tweenAnim/` 提供声明式 Tween 动画组件，直接挂到节点上，在 Inspector 里配置参数即可：

- `BaseAnim`：抽象基类，统一 `playOnEnable` / `duration` / `delay` / `loop` 属性和 `play()` / `replay()` / `stop()` 生命周期；缓动曲线由具体组件填写 Cocos easing 名称，`EasingType` / `EasingNames` 仅用于旧预制体数值兼容。
- `FadeAnim`：透明度淡入淡出，支持停留时间。
- `MoveAnim`：从 `from` 移动到 `to`，默认局部坐标，可切换世界坐标。
- `RotateAnim`：绕 Z 轴旋转指定角度。
- `ScaleAnim`：从 `from` 缩放到 `to`。
- `FloatUpAnim`：上下往返浮动，可叠加缩放脉动。
- `JellyJumpAnim`：果冻弹跳（弹起、落地压扁、衰减抖动）。
- `BellShakeAnim`：铃铛式左右衰减摆动。
- `VolcanoEruptAnim`：预震、膨胀、喷发和后坐组合动画，播放完成或停止时恢复初始位置与缩放。

组件在 `onEnable` 时按 `playOnEnable` 自动播放，`onDisable` 自动停止；循环动画停止后会停在该节点当时的变换状态，带 `_originPos` / `_originScale` 缓存的组件（`FloatUpAnim` 等）会还原到初始变换。

## 数据模型

`model/BaseModel.ts` 是运行时数据模型基类。模型层用于维护数据缓存，不直接操作 UI、场景或动画。业务模型应继承它并实现 `clear()`，例如牌桌、玩家、手牌等运行时数据缓存。

## 工具

`utils/` 当前包含：

- `AesUtils`：AES-CBC-PKCS7 加密/解密。
- `ZlibUtils`：字符串压缩、解压，以及 Base64 编解码 polyfill。
- `NumberFormatUtils`：筹码/数量格式化，支持 K/M/B 单位和小数格式控制。
- `StringUtils`：字符串格式辅助，包括按“汉字 2、英文字符 1”的权重截断并添加省略号。

## 扩展原则

- framework 只放通用能力，不放 Holdem、Hall、支付、登录、活动等业务逻辑。
- framework 不应导入 app 层配置，例如 `UIID`、`UIConfigData`、业务网络 route 或业务数据类型。
- UI 打开应走注册 ID，不恢复直接路径打开作为业务常规 API。
- 资源和语言能力应保持 Bundle 边界清晰，避免把业务资源继续堆到全局 `resources`。
- 新增能力时优先保持小而稳定的 API；如果逻辑依赖具体产品规则，应放在 app 或 game 层。
