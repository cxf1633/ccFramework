import { Canvas, director, instantiate, Node, Vec3 } from "cc";
import { ResManager } from "../res/ResManager";
import {
    UI_LAYER_ORDER,
    UILayer,
    type UICloseOptions,
    type UIConfig,
    type UIOpenOptions,
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
    params?: any;
}

interface UIPresentable {
    present(params?: any): void;
}

interface DialogRequest {
    pathInfo: UIPathInfo;
    options: UIOpenOptions;
    resolve: (node: Node | null) => void;
}

// 单个 UI 层的运行时容器，负责节点缓存、显示和关闭。
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

        this.presentNode(state.node, state.params);
        state.node.setPosition(Vec3.ZERO);
        this.node.addChild(state.node);
        this.states.set(state.key, state);
        return state.node;
    }

    public remove(target: string | Node, options: UICloseOptions = {}): boolean {
        const state = typeof target === "string" ? this.states.get(target) : this.findStateByNode(target);
        if (!state || !state.node?.isValid) return false;

        state.node.active = false;
        const destroy = options.destroy ?? state.config.destroy;
        if (destroy) {
            this.states.delete(state.key);
            state.node.destroy();
        }

        return true;
    }

    public clear(options: UICloseOptions = {}): void {
        [...this.states.keys()].forEach((key) => this.remove(key, options));
    }

    public stateCount(): number {
        return [...this.states.values()].filter((state) => state.node?.isValid && state.node.active).length;
    }

    public show(key: string, params?: any): Node | null {
        const state = this.states.get(key);
        if (!state?.node?.isValid) return null;
        state.params = params;
        return this.showState(state);
    }

    private findStateByNode(node: Node): UIState | null {
        for (const state of this.states.values()) {
            if (state.node === node) return state;
        }
        return null;
    }

    private showState(state: UIState): Node {
        state.node.setSiblingIndex(this.node.children.length - 1);
        this.presentNode(state.node, state.params);
        return state.node;
    }

    private presentNode(node: Node, params?: any): void {
        for (const component of node.components) {
            const present = (component as Partial<UIPresentable>).present;
            if (typeof present === "function") present.call(component, params);
        }
        node.active = true;
    }
}

// Dialog requests are serialized independently from layer node storage.
class UIDialogQueue {
    private readonly queue: DialogRequest[] = [];
    private opening = false;
    private nextScheduled = false;

    public constructor(
        private readonly openNow: (request: DialogRequest) => Promise<Node | null>,
        private readonly hasActiveDialog: () => boolean,
    ) { }

    public enqueue(request: DialogRequest): void {
        this.queue.push(request);
        this.next();
    }

    public isBusy(): boolean {
        return this.opening || this.hasActiveDialog() || this.queue.length > 0;
    }

    public onLayerStateChanged(): void {
        this.scheduleNext();
    }

    private next(): void {
        if (this.opening || this.hasActiveDialog()) return;

        const request = this.queue.shift();
        if (!request) return;
        void this.openRequest(request);
    }

    private scheduleNext(): void {
        if (this.nextScheduled) return;

        this.nextScheduled = true;
        setTimeout(() => {
            this.nextScheduled = false;
            this.next();
        }, 0);
    }

    private async openRequest(request: DialogRequest): Promise<void> {
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

        if (!node?.isValid || !this.hasActiveDialog()) {
            this.scheduleNext();
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
    private readonly dialogQueue: UIDialogQueue;
    private boundGuiNode: Node | null = null;

    public constructor(private readonly res: ResManager) {
        this.dialogQueue = new UIDialogQueue(
            (request) => this.openNow(request.pathInfo, request.options),
            () => (this.layers.get(UILayer.Dialog)?.stateCount() || 0) > 0,
        );
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

        if (!this.ensureSceneLayers()) return null;
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
            const layer = this.getLayerNode(layerName);
            layer?.clear(options);
            if (layerName === UILayer.Dialog) {
                this.dialogQueue.onLayerStateChanged();
            }
            return;
        }

        this.layers.forEach((layer) => layer.clear(options));
        this.dialogQueue.onLayerStateChanged();
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

        // Dialog requests are queued; other layers open immediately.
        if (layerName === UILayer.Dialog) {
            return new Promise<Node | null>((resolve) => {
                this.dialogQueue.enqueue({ pathInfo, options: openOptions, resolve });
            });
        }

        return this.openNow(pathInfo, openOptions);
    }

    private openPreloadedResolved(pathInfo: UIPathInfo, openOptions: UIOpenOptions): Node | null {
        const layerName = openOptions.layer || UILayer.PopUp;
        const layer = this.getLayerNode(layerName);
        if (!layer) return null;

        if (layerName === UILayer.Dialog && this.dialogQueue.isBusy()) {
            console.warn(`[UIManager] Cannot open preloaded dialog while busy: ${pathInfo.key}`);
            return null;
        }

        return this.openPreloadedNow(pathInfo, openOptions);
    }

    private async openNow(pathInfo: UIPathInfo, options: UIOpenOptions): Promise<Node | null> {
        const layer = this.getLayerNode(options.layer || UILayer.PopUp);
        if (!layer) return null;

        if (layer.has(pathInfo.key)) {
            const oldNode = layer.show(pathInfo.key, options.params);
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
            params: options.params,
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
            const oldNode = layer.show(pathInfo.key, options.params);
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
            params: options.params,
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
            if (!layer.remove(target, options)) continue;
            if (layer.name === UILayer.Dialog) {
                this.dialogQueue.onLayerStateChanged();
            }
            return true;
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
        if (!this.ensureSceneLayers()) return null;
        const layer = this.layers.get(layerName);
        if (!layer?.node?.isValid) {
            this.layers.delete(layerName);
            return null;
        }

        return layer;
    }

    private ensureSceneLayers(): boolean {
        const scene = director.getScene();
        const canvas = scene
            ?.getComponentsInChildren(Canvas)
            .find((component) => component.node.name === "gui");
        const guiNode = canvas?.node || null;

        if (!guiNode?.isValid) {
            this.clearLayerBindings();
            console.warn("[UIManager] gui Canvas not found in the current scene.");
            return false;
        }

        if (this.hasValidLayerBindings(guiNode)) return true;
        return this.bindSceneLayers(guiNode);
    }

    private hasValidLayerBindings(guiNode: Node): boolean {
        if (this.boundGuiNode !== guiNode || this.layers.size !== this.layerOrder.length) return false;

        return this.layerOrder.every((layerName) => {
            const layer = this.layers.get(layerName);
            return !!layer?.node?.isValid
                && layer.node.parent === guiNode
                && guiNode.getChildByName(layerName) === layer.node;
        });
    }

    private bindSceneLayers(guiNode: Node): boolean {
        const layerNodes = new Map<UILayer, Node>();
        const missingLayers: UILayer[] = [];

        this.layerOrder.forEach((layerName) => {
            const node = guiNode.getChildByName(layerName);
            if (node?.isValid) {
                layerNodes.set(layerName, node);
            } else {
                missingLayers.push(layerName);
            }
        });

        if (missingLayers.length > 0) {
            this.clearLayerBindings();
            console.error(`[UIManager] Missing UI layers under gui: ${missingLayers.join(", ")}`);
            return false;
        }

        let previousSiblingIndex = -1;
        for (const layerName of this.layerOrder) {
            const siblingIndex = layerNodes.get(layerName)!.getSiblingIndex();
            if (siblingIndex <= previousSiblingIndex) {
                this.clearLayerBindings();
                console.error(`[UIManager] Invalid UI layer order. Expected: ${this.layerOrder.join(" -> ")}`);
                return false;
            }
            previousSiblingIndex = siblingIndex;
        }

        this.layers.clear();
        this.boundGuiNode = guiNode;
        this.layerOrder.forEach((layerName) => {
            const node = layerNodes.get(layerName)!;
            this.layers.set(layerName, new UILayerNode(layerName, node));
        });
        this.dialogQueue.onLayerStateChanged();

        return true;
    }

    private clearLayerBindings(): void {
        this.boundGuiNode = null;
        this.layers.clear();
    }
}
