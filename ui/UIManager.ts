import { Canvas, director, instantiate, Node, Vec3 } from "cc";
import { ResManager } from "../res/ResManager";
import {
    UI_LAYER_ORDER,
    UILayer,
    type UICloseOptions,
    type UIConfig,
} from "./UIDefines";

type ResolvedUIConfig = UIConfig & Required<Pick<UIConfig, "destroy">>;

interface UIState {
    id: string;
    config: ResolvedUIConfig;
    node: Node;
}

interface UIOpeningState {
    config: ResolvedUIConfig;
    params?: any;
    cancelled: boolean;
    promise: Promise<Node | null>;
}

interface UIPresentable {
    present(params?: any): void;
}

interface DialogRequest {
    id: string;
    config: ResolvedUIConfig;
    params?: any;
    resolve: (node: Node | null) => void;
}

// Dialog requests are serialized independently from UI instance storage.
class UIDialogQueue {
    private readonly queue: DialogRequest[] = [];
    private opening = false;
    private nextScheduled = false;

    public constructor(
        private readonly open: (request: DialogRequest) => Promise<Node | null>,
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
            node = await this.open(request);
        } catch (err) {
            console.warn(`[UIManager] Open dialog failed: ${request.id}`, err);
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

    private readonly layerNodes: Map<UILayer, Node> = new Map();
    private readonly instances: Map<string, UIState> = new Map();
    private readonly openings: Map<string, UIOpeningState> = new Map();
    private readonly configMap: Map<string, UIConfig> = new Map();
    private readonly nodeIdMap: WeakMap<Node, string> = new WeakMap();
    private readonly dialogQueue: UIDialogQueue;
    private boundGuiNode: Node | null = null;

    public constructor(private readonly res: ResManager) {
        this.dialogQueue = new UIDialogQueue(
            (request) => this.openInstance(request.id, request.config, request.params),
            () => this.hasActiveInstanceInLayer(UILayer.Dialog),
        );
    }

    // 通过已注册的 UIID 打开界面。UIID 本身属于 app 层，UIManager 只接收字符串 key。
    public async openById(uiid: string, params?: any): Promise<Node | null> {
        const config = this.getResolvedConfig(uiid);
        if (!config) return null;
        if (!this.getLayerNode(config.layer)) return null;

        if (config.layer === UILayer.Dialog) {
            return new Promise<Node | null>((resolve) => {
                this.dialogQueue.enqueue({ id: uiid, config, params, resolve });
            });
        }

        return this.openInstance(uiid, config, params);
    }

    public openPreloadedById(uiid: string, params?: any): Node | null {
        const config = this.getResolvedConfig(uiid);
        if (!config) return null;
        const layerNode = this.getLayerNode(config.layer);
        if (!layerNode) return null;

        if (config.layer === UILayer.Dialog && this.dialogQueue.isBusy()) {
            console.warn(`[UIManager] Cannot open preloaded dialog while busy: ${uiid}`);
            return null;
        }

        return this.openCachedInstance(uiid, config, params, layerNode);
    }

    public async preloadById(uiid: string): Promise<boolean> {
        const config = this.getResolvedConfig(uiid);
        if (!config) return false;
        return await this.res.preloadPrefabFromBundle(config.bundle, config.prefab);
    }

    public async preloadByIds(uiids: readonly string[]): Promise<void> {
        await Promise.all(uiids.map((uiid) => this.preloadById(uiid)));
    }

    public closeById(uiid: string, options: UICloseOptions = {}): boolean {
        if (!this.getRegisteredConfig(uiid)) return false;
        return this.closeInstanceOrOpening(uiid, options);
    }

    public hasById(uiid: string): boolean {
        return !!this.getById(uiid);
    }

    public getById(uiid: string): Node | null {
        if (!this.getRegisteredConfig(uiid)) return null;
        return this.get(uiid);
    }

    public create(bundleName: string, prefabPath: string): Promise<Node | null> {
        return this.createNode(bundleName, prefabPath);
    }

    // 初始化 UI 配置和层级，并返回指定 UI 层，通常由启动流程调用一次即可。
    public init(configs?: Record<string, UIConfig>, layerName?: UILayer): Node | null {
        this.initUIConfigs(configs);

        if (!this.ensureSceneLayers()) return null;
        return this.layerNodes.get(layerName || UILayer.UI) || null;
    }

    public close(target: string | Node, options: UICloseOptions = {}): boolean {
        if (target instanceof Node) {
            const uiid = this.nodeIdMap.get(target);
            if (!uiid) return false;
            const state = this.getInstance(uiid);
            if (!state || state.node !== target) return false;
            return this.closeInstanceOrOpening(uiid, options);
        }

        return this.closeInstanceOrOpening(target, options);
    }

    public closeAll(layerName?: UILayer, options: UICloseOptions = {}): void {
        for (const opening of this.openings.values()) {
            if (!layerName || opening.config.layer === layerName) {
                opening.cancelled = true;
            }
        }

        const ids = [...this.instances.values()]
            .filter((state) => !layerName || state.config.layer === layerName)
            .map((state) => state.id);
        ids.forEach((uiid) => this.removeInstance(uiid, options));

        if (!layerName || layerName === UILayer.Dialog) {
            this.dialogQueue.onLayerStateChanged();
        }
    }

    public get(target: string): Node | null {
        return this.getInstance(target)?.node || null;
    }

    public has(target: string): boolean {
        return !!this.get(target);
    }

    private openInstance(uiid: string, config: ResolvedUIConfig, params?: any): Promise<Node | null> {
        const oldState = this.getInstance(uiid);
        if (oldState) {
            const oldNode = this.showInstance(oldState, params);
            if (oldNode) return Promise.resolve(oldNode);
        }

        const currentOpening = this.openings.get(uiid);
        if (currentOpening) {
            currentOpening.params = params;
            currentOpening.cancelled = false;
            return currentOpening.promise;
        }

        const layerNode = this.getLayerNode(config.layer);
        if (!layerNode) return Promise.resolve(null);

        const cachedNode = this.createCachedNode(config.bundle, config.prefab);
        if (cachedNode?.isValid) {
            return Promise.resolve(this.mountInstance(uiid, config, cachedNode, params, layerNode));
        }

        const opening: UIOpeningState = {
            config,
            params,
            cancelled: false,
            promise: Promise.resolve(null),
        };
        opening.promise = this.loadAndMountInstance(uiid, opening);
        this.openings.set(uiid, opening);
        return opening.promise;
    }

    private openCachedInstance(
        uiid: string,
        config: ResolvedUIConfig,
        params: any,
        layerNode: Node,
    ): Node | null {
        const oldState = this.getInstance(uiid);
        if (oldState) {
            const oldNode = this.showInstance(oldState, params);
            if (oldNode) return oldNode;
        }

        if (this.openings.has(uiid)) {
            console.warn(`[UIManager] Cannot open preloaded ui while opening: ${uiid}`);
            return null;
        }

        const node = this.createCachedNode(config.bundle, config.prefab);
        if (!node || !node.isValid) {
            console.error(`[UIManager] Preloaded ui missing: ${uiid} (${config.bundle}/${config.prefab}).`);
            return null;
        }

        return this.mountInstance(uiid, config, node, params, layerNode);
    }

    private async loadAndMountInstance(uiid: string, opening: UIOpeningState): Promise<Node | null> {
        try {
            const { config } = opening;
            const node = await this.createNode(config.bundle, config.prefab);
            if (!node || !node.isValid) {
                console.warn(`[UIManager] Open ui failed: ${uiid} (${config.bundle}/${config.prefab}).`);
                return null;
            }

            if (opening.cancelled) {
                node.destroy();
                return null;
            }

            const oldState = this.getInstance(uiid);
            if (oldState) {
                const oldNode = this.showInstance(oldState, opening.params);
                if (oldNode) {
                    node.destroy();
                    return oldNode;
                }
            }

            const layerNode = this.getLayerNode(config.layer);
            if (!layerNode) {
                node.destroy();
                return null;
            }

            return this.mountInstance(uiid, config, node, opening.params, layerNode);
        } finally {
            if (this.openings.get(uiid) === opening) {
                this.openings.delete(uiid);
            }
        }
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

    private createCachedNode(bundleName: string, prefabPath: string): Node | null {
        const prefab = this.res.getCachedPrefabFromBundle(bundleName, prefabPath);
        if (!prefab) {
            return null;
        }

        return instantiate(prefab);
    }

    private mountInstance(
        uiid: string,
        config: ResolvedUIConfig,
        node: Node,
        params: any,
        layerNode: Node,
    ): Node {
        const state: UIState = { id: uiid, config, node };
        this.presentNode(node, params);
        node.setPosition(Vec3.ZERO);
        this.instances.set(uiid, state);
        this.nodeIdMap.set(node, uiid);
        layerNode.addChild(node);
        console.log(`[UIManager] Open ui success: ${uiid} (${config.bundle}/${config.prefab}) -> ${config.layer}`);
        return node;
    }

    private showInstance(state: UIState, params?: any): Node | null {
        const layerNode = this.getLayerNode(state.config.layer);
        if (!layerNode || state.node.parent !== layerNode) {
            this.instances.delete(state.id);
            if (state.node.isValid) state.node.destroy();
            if (state.config.layer === UILayer.Dialog) {
                this.dialogQueue.onLayerStateChanged();
            }
            return null;
        }

        state.node.setSiblingIndex(layerNode.children.length - 1);
        this.presentNode(state.node, params);
        return state.node;
    }

    private presentNode(node: Node, params?: any): void {
        for (const component of node.components) {
            const present = (component as Partial<UIPresentable>).present;
            if (typeof present === "function") present.call(component, params);
        }
        node.active = true;
    }

    private getInstance(uiid: string): UIState | null {
        const state = this.instances.get(uiid);
        if (!state) return null;
        if (state.node?.isValid) return state;

        this.instances.delete(uiid);
        if (state.config.layer === UILayer.Dialog) {
            this.dialogQueue.onLayerStateChanged();
        }
        return null;
    }

    private closeInstanceOrOpening(uiid: string, options: UICloseOptions): boolean {
        const removed = this.removeInstance(uiid, options);
        const opening = this.openings.get(uiid);
        if (opening) opening.cancelled = true;
        return removed || !!opening;
    }

    private removeInstance(uiid: string, options: UICloseOptions): boolean {
        const state = this.getInstance(uiid);
        if (!state) return false;

        state.node.active = false;
        const destroy = options.destroy ?? state.config.destroy;
        if (destroy) {
            this.instances.delete(uiid);
            state.node.destroy();
        }

        if (state.config.layer === UILayer.Dialog) {
            this.dialogQueue.onLayerStateChanged();
        }
        return true;
    }

    private hasActiveInstanceInLayer(layerName: UILayer): boolean {
        for (const [uiid, state] of this.instances) {
            if (!state.node?.isValid) {
                this.instances.delete(uiid);
                continue;
            }
            if (state.config.layer === layerName && state.node.active) return true;
        }
        return false;
    }

    private initUIConfigs(configs?: Record<string, UIConfig>): void {
        if (!configs) return;

        for (const key in configs) {
            this.configMap.set(key, configs[key]);
        }
    }

    private getResolvedConfig(uiid: string): ResolvedUIConfig | null {
        const config = this.getRegisteredConfig(uiid);
        if (!config) return null;
        if (!config.bundle || !config.prefab || !config.layer) {
            console.warn(`[UIManager] Invalid UI config: ${uiid}`);
            return null;
        }

        return {
            ...config,
            destroy: config.destroy ?? true,
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

    private getLayerNode(layerName: UILayer): Node | null {
        if (!this.ensureSceneLayers()) return null;
        const node = this.layerNodes.get(layerName);
        if (!node?.isValid) {
            this.layerNodes.delete(layerName);
            return null;
        }

        return node;
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
        if (this.boundGuiNode !== guiNode || this.layerNodes.size !== this.layerOrder.length) return false;

        return this.layerOrder.every((layerName) => {
            const node = this.layerNodes.get(layerName);
            return !!node?.isValid
                && node.parent === guiNode
                && guiNode.getChildByName(layerName) === node;
        });
    }

    private bindSceneLayers(guiNode: Node): boolean {
        const resolvedLayerNodes = new Map<UILayer, Node>();
        const missingLayers: UILayer[] = [];

        this.layerOrder.forEach((layerName) => {
            const node = guiNode.getChildByName(layerName);
            if (node?.isValid) {
                resolvedLayerNodes.set(layerName, node);
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
            const siblingIndex = resolvedLayerNodes.get(layerName)!.getSiblingIndex();
            if (siblingIndex <= previousSiblingIndex) {
                this.clearLayerBindings();
                console.error(`[UIManager] Invalid UI layer order. Expected: ${this.layerOrder.join(" -> ")}`);
                return false;
            }
            previousSiblingIndex = siblingIndex;
        }

        for (const [uiid, state] of this.instances) {
            const layerNode = resolvedLayerNodes.get(state.config.layer);
            if (!state.node?.isValid || state.node.parent !== layerNode) {
                this.instances.delete(uiid);
            }
        }
        this.layerNodes.clear();
        this.boundGuiNode = guiNode;
        this.layerOrder.forEach((layerName) => {
            this.layerNodes.set(layerName, resolvedLayerNodes.get(layerName)!);
        });
        this.dialogQueue.onLayerStateChanged();

        return true;
    }

    private clearLayerBindings(): void {
        this.boundGuiNode = null;
        this.layerNodes.clear();
        this.instances.clear();
    }
}
