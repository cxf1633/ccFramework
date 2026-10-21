import { instantiate, isValid, Node } from "cc";
import type { ResManager } from "../res/ResManager";
import type { UIBase } from "./UIBase";

export interface UIModuleLoadOptions<T extends UIBase> {
    bundle: string;
    prefab: string;
    component: new () => T;
    /** 延迟获取挂载节点，避免资源等待期间父节点已失效。 */
    parent: () => Node | null;
    /** 可选的预挂载实例。 */
    instance?: T | null;
    canCreate?: () => boolean;
    onCreated?: (module: T) => void;
}

/** 界面按需持有的子模块加载器；同一 bundle/prefab 在一个加载器中对应一个实例。 */
export class UIModuleLoader {
    private readonly instances: Map<string, UIBase> = new Map();
    private readonly pending: Map<string, Promise<UIBase | null>> = new Map();
    private disposed = false;

    constructor(private readonly owner: UIBase, private readonly resources: ResManager) { }

    /** 复用实例和进行中的请求，加载失败后允许重试。 */
    public async ensure<T extends UIBase>(options: UIModuleLoadOptions<T>): Promise<T | null> {
        if (!this.isOwnerValid()) return null;

        const key = `${options.bundle}:${options.prefab}`;
        const instance = options.instance ?? this.instances.get(key);
        if (instance && isValid(instance, true) && isValid(instance.node, true)) {
            return instance.node.getComponent(options.component);
        }
        const pending = this.pending.get(key);
        if (pending) {
            const module = await pending;
            return this.isOwnerValid() && module && isValid(module, true) && isValid(module.node, true)
                ? module.node.getComponent(options.component) : null;
        }

        const loading = this.load(options, key);
        this.pending.set(key, loading);
        try {
            return await loading;
        } finally {
            if (this.pending.get(key) === loading) this.pending.delete(key);
        }
    }

    /** 在界面的 onDispose 中调用；使未完成请求失效。子节点由所属界面销毁。 */
    public dispose(): void {
        this.disposed = true;
        this.pending.clear();
        this.instances.clear();
    }

    private isOwnerValid(): boolean {
        return !this.disposed && isValid(this.owner, true) && isValid(this.owner.node, true);
    }

    private async load<T extends UIBase>(options: UIModuleLoadOptions<T>, key: string): Promise<T | null> {
        let node: Node | null = null;
        try {
            await this.resources.ensureBundle(options.bundle, { cacheable: true });
            if (!this.isOwnerValid()) return null;

            const result = await this.resources.loadPrefabFromBundle(options.bundle, options.prefab);
            if (!this.isOwnerValid() || (options.canCreate && !options.canCreate())) return null;
            if (!result.success || !result.prefab) {
                console.warn(`[UIModuleLoader] Load ${key} failed. ${result.error || ""}`);
                return null;
            }
            const parent = options.parent();
            if (!parent || !isValid(parent, true)) {
                console.warn(`[UIModuleLoader] Parent node is not found for ${key}.`);
                return null;
            }

            node = instantiate(result.prefab);
            const module = node.getComponent(options.component);
            if (!module) {
                throw new Error(`Component is not mounted on ${key}.`);
            }
            parent.addChild(node);
            options.onCreated?.(module);
            if (!this.isOwnerValid() || !isValid(module, true) || !isValid(node, true)) {
                if (isValid(node, true)) node.destroy();
                return null;
            }
            this.instances.set(key, module);
            return module;
        } catch (error) {
            if (node && isValid(node, true)) node.destroy();
            console.warn(`[UIModuleLoader] Load ${key} failed.`, error);
            return null;
        }
    }
}
