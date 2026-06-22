import { Canvas, director, instantiate, Node, UITransform, Vec3, Widget } from "cc";
import { ResManager } from "../res/ResManager";
import {
    UI_LAYER_ORDER,
    UILayer,
    type UICloseOptions,
    type UIConfig,
    type UIOpenOptions,
    type UIOpenParam,
} from "./UIDefines";

interface UIPathInfo {
    bundleName: string;
    prefabPath: string;
    key: string;
}

interface UIState {
    key: string;
    config: Required<Pick<UIConfig, "prefab" | "layer" | "destroy">> & UIConfig;
    node: Node;
    param: UIOpenParam;
}

interface DialogRequest {
    pathInfo: UIPathInfo;
    options: UIOpenOptions;
    resolve: (node: Node | null) => void;
}

// 单个 UI 层的运行时容器，负责节点缓存和关闭回调。
class UILayerNode {
    private readonly states: Map<string, UIState> = new Map();

    public constructor(
        public readonly name: UILayer,
        public readonly node: Node,
    ) { }

    public has(key: string): boolean {
        return this.states.has(key);
    }

    public get(key: string): Node | null {
        return this.states.get(key)?.node || null;
    }

    public add(state: UIState): Node {
        const oldState = this.states.get(state.key);
        if (oldState?.node?.isValid) {
            return this.showState(oldState);
        }

        this.callComponents(state.node, "setShowParams", state.param.params);
        state.node.active = true;
        state.node.setPosition(Vec3.ZERO);
        this.node.addChild(state.node);
        this.states.set(state.key, state);
        return state.node;
    }

    public remove(target: string | Node, options: UICloseOptions = {}): boolean {
        const state = typeof target === "string" ? this.states.get(target) : this.findStateByNode(target);
        if (!state || !state.node?.isValid) return false;

        const removeNext = () => {
            const destroy = options.destroy ?? state.config.destroy;
            if (destroy) {
                this.states.delete(state.key);
                state.node.destroy();
            } else {
                state.node.active = false;
            }

            this.callComponents(state.node, "onRemoved", state.param.params);
            state.param.onRemoved?.(state.node, state.param.params);
        };

        this.callComponents(state.node, "onBeforeRemove", state.param.params);
        if (state.param.onBeforeRemove) {
            state.param.onBeforeRemove(state.node, removeNext, state.param.params);
        } else {
            removeNext();
        }

        return true;
    }

    public clear(options: UICloseOptions = {}): void {
        [...this.states.keys()].forEach((key) => this.remove(key, options));
    }

    public stateCount(): number {
        return [...this.states.values()].filter((state) => state.node?.isValid && state.node.active).length;
    }

    public show(key: string, param?: UIOpenParam): Node | null {
        const state = this.states.get(key);
        if (!state?.node?.isValid) return null;
        if (param) state.param = param;
        return this.showState(state);
    }

    private findStateByNode(node: Node): UIState | null {
        for (const state of this.states.values()) {
            if (state.node === node) return state;
        }
        return null;
    }

    private showState(state: UIState): Node {
        const wasActive = state.node.activeInHierarchy;
        this.callComponents(state.node, "setShowParams", state.param.params);
        state.node.active = true;
        state.node.setSiblingIndex(this.node.children.length - 1);
        if (wasActive) {
            this.callComponents(state.node, "onShow", state.param.params);
        }
        return state.node;
    }

    private callComponents(node: Node, methodName: string, data: any): void {
        for (const component of node.components) {
            const method = (component as any)[methodName];
            if (typeof method === "function") method.call(component, data);
        }
    }
}

// Dialog 层同一时间只展示一个窗口，后续请求排队等待当前窗口关闭。
class UIDialogLayerNode extends UILayerNode {
    private readonly queue: DialogRequest[] = [];
    private currentKey: string | null = null;
    private opening = false;
    private openNow: ((request: DialogRequest) => Promise<Node | null>) | null = null;

    public enqueue(request: DialogRequest, openNow: (request: DialogRequest) => Promise<Node | null>): void {
        this.openNow = openNow;
        if (this.opening || this.currentKey || this.stateCount() > 0) {
            this.queue.push(request);
            return;
        }

        this.openRequest(request);
    }

    public override add(state: UIState): Node {
        this.currentKey = state.key;
        return super.add(state);
    }

    public isBusy(): boolean {
        return this.opening || !!this.currentKey || this.stateCount() > 0;
    }

    public override remove(target: string | Node, options: UICloseOptions = {}): boolean {
        const removed = super.remove(target, options);
        if (removed) {
            this.currentKey = null;
            setTimeout(() => this.next(), 0);
        }
        return removed;
    }

    private next(): void {
        if (this.opening || this.currentKey || this.stateCount() > 0) return;

        const request = this.queue.shift();
        if (!request) return;
        this.openRequest(request);
    }

    private async openRequest(request: DialogRequest): Promise<void> {
        if (!this.openNow) {
            request.resolve(null);
            return;
        }

        this.opening = true;
        let node: Node | null = null;
        try {
            node = await this.openNow(request);
        } catch (err) {
            console.warn(`[UIManager] Open dialog failed: ${request.pathInfo.key}`, err);
        } finally {
            this.opening = false;
        }

        request.resolve(node);

        if (!node) {
            setTimeout(() => this.next(), 0);
        }
    }
}

// UI 管理入口，负责 UI 配置注册、层级初始化、界面打开关闭。
export class UIManager {
    // 越靠后的层 siblingIndex 越高。
    private readonly layerOrder = UI_LAYER_ORDER;

    private readonly layers: Map<UILayer, UILayerNode> = new Map();
    private readonly configMap: Map<string, UIConfig> = new Map();
    private readonly nodeKeyMap: WeakMap<Node, string> = new WeakMap();

    public constructor(private readonly res: ResManager) {
    }

    // public async open(path: string, options?: UIOpenOptions): Promise<Node | null>;
    // public async open(bundleName: string, prefabPath: string, options?: UIOpenOptions): Promise<Node | null>;
    // public async open(bundleNameOrPath: string, prefabPathOrOptions?: string | UIOpenOptions, options?: UIOpenOptions): Promise<Node | null> {
    //     const pathInfo = this.parsePath(bundleNameOrPath, prefabPathOrOptions);
    //     if (!pathInfo) {
    //         console.warn(`[UIManager] Invalid ui path: ${bundleNameOrPath}`);
    //         return null;
    //     }

    //     const openOptions = this.resolveOpenOptions(pathInfo, prefabPathOrOptions, options);
    //     return this.openResolved(pathInfo, openOptions);
    // }

    // 通过已注册的 UIID 打开界面。UIID 本身属于 app 层，UIManager 只接收字符串 key。
    public async openById(uiid: string, params?: any): Promise<Node | null> {
        const config = this.getRegisteredConfig(uiid);
        if (!config) return null;

        const openOptions: UIOpenOptions = { ...config, params };
        const pathInfo = this.parseConfig(uiid, openOptions);
        if (!pathInfo) return null;

        return this.openResolved(pathInfo, openOptions);
    }

    public openPreloadedById(uiid: string, params?: any): Node | null {
        const config = this.getRegisteredConfig(uiid);
        if (!config) return null;

        const openOptions: UIOpenOptions = { ...config, params };
        const pathInfo = this.parseConfig(uiid, openOptions);
        if (!pathInfo) return null;

        return this.openPreloadedResolved(pathInfo, openOptions);
    }

    public async preloadById(uiid: string): Promise<boolean> {
        const config = this.getRegisteredConfig(uiid);
        if (!config) return false;

        const pathInfo = this.parseConfig(uiid, config);
        if (!pathInfo) return false;

        return await this.res.preloadPrefabFromBundle(pathInfo.bundleName, pathInfo.prefabPath);
    }

    public async preloadByIds(uiids: readonly string[]): Promise<void> {
        await Promise.all(uiids.map((uiid) => this.preloadById(uiid)));
    }

    public closeById(uiid: string, options: UICloseOptions = {}): boolean {
        const pathInfo = this.parseConfig(uiid, this.getRegisteredConfig(uiid));
        if (!pathInfo) return false;
        return this.removeFromLayers(pathInfo.key, options);
    }

    public hasById(uiid: string): boolean {
        return !!this.getById(uiid);
    }

    public getById(uiid: string): Node | null {
        const pathInfo = this.parseConfig(uiid, this.getRegisteredConfig(uiid));
        if (!pathInfo) return null;
        return this.get(pathInfo.key);
    }

    public create(bundleName: string, prefabPath: string): Promise<Node | null> {
        return this.createNode(bundleName, prefabPath);
    }

    // 初始化 UI 配置和层级，并返回指定 UI 层，通常由启动流程调用一次即可。
    public init(configs?: Record<string, UIConfig>, layerName?: UILayer): Node | null {
        this.initUIConfigs(configs);

        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (!canvas) {
            console.warn("[UIManager] Canvas not found.");
            return null;
        }

        this.ensureAllLayers(canvas);
        return this.layers.get(layerName || UILayer.UI)?.node || null;
    }

    public close(target: string | Node, options: UICloseOptions = {}): boolean {
        if (target instanceof Node) {
            const key = this.nodeKeyMap.get(target);
            return this.removeFromLayers(key || target, options);
        }

        const pathInfo = this.parsePath(target);
        return this.removeFromLayers(pathInfo?.key || target, options);
    }

    public closeAll(layerName?: UILayer, options: UICloseOptions = {}): void {
        if (layerName) {
            this.getLayerNode(layerName)?.clear(options);
            return;
        }

        this.layers.forEach((layer) => layer.clear(options));
    }

    public get(target: string): Node | null {
        const key = this.parsePath(target)?.key || target;
        for (const layer of this.layers.values()) {
            const node = layer.get(key);
            if (node) return node;
        }
        return null;
    }

    public has(target: string): boolean {
        return !!this.get(target);
    }

    private openResolved(pathInfo: UIPathInfo, openOptions: UIOpenOptions): Promise<Node | null> {
        const layerName = openOptions.layer || UILayer.PopUp;
        const layer = this.getLayerNode(layerName);
        if (!layer) return Promise.resolve(null);

        // Dialog 层有排队语义，其他层直接打开。
        if (layer instanceof UIDialogLayerNode) {
            return new Promise<Node | null>((resolve) => {
                layer.enqueue({ pathInfo, options: openOptions, resolve }, (request) => this.openNow(request.pathInfo, request.options));
            });
        }

        return this.openNow(pathInfo, openOptions);
    }

    private openPreloadedResolved(pathInfo: UIPathInfo, openOptions: UIOpenOptions): Node | null {
        const layerName = openOptions.layer || UILayer.PopUp;
        const layer = this.getLayerNode(layerName);
        if (!layer) return null;

        if (layer instanceof UIDialogLayerNode && layer.isBusy()) {
            console.warn(`[UIManager] Cannot open preloaded dialog while busy: ${pathInfo.key}`);
            return null;
        }

        return this.openPreloadedNow(pathInfo, openOptions);
    }

    private async openNow(pathInfo: UIPathInfo, options: UIOpenOptions): Promise<Node | null> {
        const layer = this.getLayerNode(options.layer || UILayer.PopUp);
        if (!layer) return null;

        if (layer.has(pathInfo.key)) {
            const oldNode = layer.show(pathInfo.key, options);
            if (oldNode?.isValid) {
                return oldNode;
            }
        }

        const node = await this.createNode(pathInfo.bundleName, pathInfo.prefabPath);
        if (!node || !node.isValid) {
            console.warn(`[UIManager] Open ui failed: ${pathInfo.key}.`);
            return null;
        }

        const config = this.initConfig(pathInfo, options);
        const state: UIState = {
            key: pathInfo.key,
            config,
            node,
            param: options,
        };

        layer.add(state);
        this.nodeKeyMap.set(node, pathInfo.key);
        console.log(`[UIManager] Open ui success: ${pathInfo.key} -> ${config.layer}`);
        return node;
    }

    private openPreloadedNow(pathInfo: UIPathInfo, options: UIOpenOptions): Node | null {
        const layer = this.getLayerNode(options.layer || UILayer.PopUp);
        if (!layer) return null;

        if (layer.has(pathInfo.key)) {
            const oldNode = layer.show(pathInfo.key, options);
            if (oldNode?.isValid) {
                return oldNode;
            }
        }

        const node = this.createPreloadedNode(pathInfo.bundleName, pathInfo.prefabPath);
        if (!node || !node.isValid) {
            console.error(`[UIManager] Preloaded ui missing: ${pathInfo.key}.`);
            return null;
        }

        const config = this.initConfig(pathInfo, options);
        const state: UIState = {
            key: pathInfo.key,
            config,
            node,
            param: options,
        };

        layer.add(state);
        this.nodeKeyMap.set(node, pathInfo.key);
        console.log(`[UIManager] Open preloaded ui success: ${pathInfo.key} -> ${config.layer}`);
        return node;
    }

    private async createNode(bundleName: string, prefabPath: string): Promise<Node | null> {
        try {
            await this.res.ensureBundle(bundleName, { cacheable: true });
        } catch (err) {
            console.warn(`[UIManager] Load ui bundle failed: ${bundleName}/${prefabPath}`, err);
            return null;
        }

        const result = await this.res.loadPrefabFromBundle(bundleName, prefabPath);
        if (!result.success || !result.prefab) {
            console.warn(`[UIManager] Create ui failed: ${bundleName}/${prefabPath}`, result.error);
            return null;
        }

        return instantiate(result.prefab);
    }

    private createPreloadedNode(bundleName: string, prefabPath: string): Node | null {
        const prefab = this.res.getCachedPrefabFromBundle(bundleName, prefabPath);
        if (!prefab) {
            return null;
        }

        return instantiate(prefab);
    }

    private removeFromLayers(target: string | Node, options: UICloseOptions): boolean {
        for (const layer of this.layers.values()) {
            if (layer.remove(target, options)) return true;
        }
        return false;
    }

    private initUIConfigs(configs?: Record<string, UIConfig>): void {
        if (!configs) return;

        for (const key in configs) {
            this.configMap.set(key, configs[key]);
        }
    }

    private parsePath(bundleNameOrPath: string, prefabPathOrOptions?: string | UIOpenOptions): UIPathInfo | null {
        if (typeof prefabPathOrOptions === "string") {
            return {
                bundleName: bundleNameOrPath,
                prefabPath: prefabPathOrOptions,
                key: `${bundleNameOrPath}/${prefabPathOrOptions}`,
            };
        }

        const path = bundleNameOrPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        const segments = path.split("/");
        if (segments.length < 2) return null;

        const bundleName = segments.shift()!;
        const prefabPath = segments.join("/");
        return {
            bundleName,
            prefabPath,
            key: `${bundleName}/${prefabPath}`,
        };
    }

    private parseConfig(uiid: string, config: UIConfig | null): UIPathInfo | null {
        if (!config) return null;
        if (!config.bundle || !config.prefab) {
            console.warn(`[UIManager] Invalid UI config: ${uiid}`);
            return null;
        }

        return {
            bundleName: config.bundle,
            prefabPath: config.prefab,
            key: `${config.bundle}/${config.prefab}`,
        };
    }

    // private resolveOpenOptions(pathInfo: UIPathInfo, prefabPathOrOptions?: string | UIOpenOptions, options?: UIOpenOptions): UIOpenOptions {
    //     const inlineOptions = typeof prefabPathOrOptions === "object" ? prefabPathOrOptions : options;
    //     const registered = this.configMap.get(pathInfo.key) || this.configMap.get(pathInfo.prefabPath);
    //     return {
    //         ...registered,
    //         ...inlineOptions,
    //         bundle: inlineOptions?.bundle || registered?.bundle || pathInfo.bundleName,
    //         prefab: inlineOptions?.prefab || registered?.prefab || pathInfo.prefabPath,
    //     };
    // }

    // 补齐一次打开请求的默认配置。
    private initConfig(pathInfo: UIPathInfo, options: UIOpenOptions): UIState["config"] {
        return {
            ...options,
            bundle: options.bundle || pathInfo.bundleName,
            prefab: options.prefab || pathInfo.prefabPath,
            layer: options.layer || UILayer.PopUp,
            destroy: options.destroy ?? true,
        };
    }

    private getRegisteredConfig(uiid: string): UIConfig | null {
        const config = this.configMap.get(uiid);
        if (!config) {
            console.warn(`[UIManager] Missing UI config: ${uiid}`);
            return null;
        }
        return config;
    }

    private getLayerNode(layerName: UILayer): UILayerNode | null {
        const canvas = director.getScene()?.getComponentInChildren(Canvas);
        if (!canvas) {
            console.warn("[UIManager] Canvas not found.");
            return null;
        }

        this.ensureAllLayers(canvas);
        const layer = this.layers.get(layerName);
        if (!layer?.node?.isValid) {
            this.layers.delete(layerName);
            return null;
        }

        return layer;
    }

    private ensureAllLayers(canvas: Canvas): void {
        const guiRoot = this.ensureUIHierarchy(canvas);
        this.layerOrder.forEach((layerName, index) => {
            const node = this.getOrCreateChild(guiRoot, layerName);
            setupFullScreenNode(node, guiRoot);
            node.setSiblingIndex(index + 1);

            const cachedLayer = this.layers.get(layerName);
            if (!cachedLayer || !cachedLayer.node?.isValid || cachedLayer.node !== node) {
                const layer = layerName === UILayer.Dialog ? new UIDialogLayerNode(layerName, node) : new UILayerNode(layerName, node);
                this.layers.set(layerName, layer);
            }
        });
    }

    private ensureUIHierarchy(canvas: Canvas): Node {
        // 兼容旧项目里 Canvas 节点本身就是 gui 的结构。
        if (canvas.node.name === "gui" && canvas.node.parent?.getChildByName("game")) {
            const uiCamera = this.getOrCreateChild(canvas.node, "UICamera");
            uiCamera.setSiblingIndex(0);
            return canvas.node;
        }

        const uiRoot = this.getOrCreateChild(canvas.node, "UIRoot");
        setupFullScreenNode(uiRoot, canvas.node);

        const root = this.getOrCreateChild(uiRoot, "root");
        setupFullScreenNode(root, uiRoot);

        const game = this.getOrCreateChild(root, "game");
        setupFullScreenNode(game, root);
        game.setSiblingIndex(0);

        const gui = this.getOrCreateChild(root, "gui");
        setupFullScreenNode(gui, root);
        gui.setSiblingIndex(1);

        const uiCamera = this.getOrCreateChild(gui, "UICamera");
        setupFullScreenNode(uiCamera, gui);
        uiCamera.setSiblingIndex(0);

        return gui;
    }

    private getOrCreateChild(parent: Node, name: string): Node {
        let child = parent.getChildByName(name);
        if (!child) {
            child = new Node(name);
            parent.addChild(child);
        }
        return child;
    }
}

// 设置节点为跟随父节点尺寸的全屏 UI 节点。
function setupFullScreenNode(node: Node, parent: Node): void {
    node.layer = parent.layer;
    node.setPosition(Vec3.ZERO);

    const parentTransform = parent.getComponent(UITransform);
    let transform = node.getComponent(UITransform);
    if (!transform) transform = node.addComponent(UITransform);
    if (parentTransform) {
        transform.setContentSize(parentTransform.contentSize);
        transform.setAnchorPoint(parentTransform.anchorPoint);
    }

    let widget = node.getComponent(Widget);
    if (!widget) widget = node.addComponent(Widget);
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.left = 0;
    widget.right = 0;
    widget.top = 0;
    widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ALWAYS;
    widget.updateAlignment();
}
