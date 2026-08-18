import { _decorator, Button, Component, Label, Node } from "cc";

const { ccclass } = _decorator;

type ButtonHandler = (event?: any, customEventData?: string) => void;

interface ButtonBinding {
    node: Node;
    callback: (event?: any) => void;
}

export interface UIButtonBindingConfig {
    path: string | Node;
    handler: ButtonHandler | string;
    customEventData?: string;
}

export interface NodePathOptions {
    /** 指定路径根节点；不传时使用场景最顶层节点。 */
    root?: Node | null;
    /** 是否包含根节点名称，默认 true。 */
    includeRoot?: boolean;
    /** 同名兄弟节点是否追加下标，默认 false。 */
    includeSiblingIndex?: boolean;
}

@ccclass("UIBase")
export class UIBase extends Component {
    public nodes: Map<string, Node> = null!;
    private readonly buttonBindings: ButtonBinding[] = [];
    private showParams: any = null;


    protected __preload(): void {
        this.nodeTreeInfoLite();
        this.bindButtonsByNodeName();

    }
    protected onLoad(): void {
        this.onInit();
    }

    protected onDestroy(): void {
        this.onDispose();
        this.clearButtonBindings();
        if (this.nodes) {
            this.nodes.clear();
            this.nodes = null!;
        }
    }

    protected onEnable(): void {
        this.onShow(this.showParams);
    }
    protected onDisable(): void {
        this.onHide();
    }
    protected onInit(): void {
        // 子类自己的初始化逻辑
    }
    protected onDispose(): void {
        // 子类自己的销毁逻辑
    }
    protected onShow(params?: any): void {

    }
    protected onHide(): void {

    }

    public present(params?: any): void {
        const wasActive = this.node.activeInHierarchy;
        this.setShowParams(params);
        if (wasActive) {
            this.onShow(this.showParams);
        }
    }

    public setShowParams(params?: any): void {
        this.showParams = params;
    }

    public getNode(name: string): Node | null {
        if (this.nodes) {
            const node = this.nodes.get(name);
            if (node) return node;
        }

        return this.getChildByPath(this.node, name);
    }

    /** 获取从场景最顶层节点到目标节点的完整路径。 */
    public getFullPath(node: Node | null): string {
        return this.getPath(node);
    }

    /** 获取目标节点相对指定根节点的路径。 */
    public getRelativePath(node: Node | null, root: Node = this.node, includeRoot: boolean = true): string {
        return this.getPath(node, { root, includeRoot });
    }

    /** 获取带同名兄弟节点下标的路径。 */
    public getIndexedPath(node: Node | null, includeRoot: boolean = false): string {
        return this.getPath(node, { includeRoot, includeSiblingIndex: true });
    }

    /** 从指定根节点开始，按相对路径查找子节点。 */
    public getChildByPath(root: Node | null | undefined, path: string): Node | null {
        const names = path.split("/").filter(Boolean);
        let current = root || null;
        if (current && names[0] === current.name) {
            names.shift();
        }

        for (const name of names) {
            current = current?.getChildByName(name) || null;
            if (!current) return null;
        }

        return current;
    }

    /** 按参数生成节点路径。 */
    public getPath(node: Node | null, options: NodePathOptions = {}): string {
        const names: string[] = [];
        let current: Node | null = node;
        const includeRoot = options.includeRoot ?? true;

        while (current) {
            const isRoot = options.root ? current === options.root : current.parent == null;
            if (!isRoot || includeRoot) {
                names.unshift(this.getPathName(current, !!options.includeSiblingIndex));
            }

            if (isRoot) {
                break;
            }

            current = current.parent;
        }

        return names.join("/");
    }

    protected setLabelText(target: string | Node | null | undefined | Label, text: string | number): void {
        const node = typeof target === "string" ? this.getNode(target) : target;
        const label = node?.getComponent(Label);
        if (label) {
            label.string = String(text);
        }
    }

    protected setActive(node: Node | null | undefined, active: boolean): void {
        if (node?.isValid) {
            node.active = active;
        }
    }

    protected nodeTreeInfoLite(): void {
        this.nodes = new Map();
        this.collectNodeTreeInfoLite(this.node, this.nodes);
    }

    protected bindButtonsByNodeName(): void {
        const buttons: Button[] = [];
        this.collectOwnedButtons(this.node, buttons);

        buttons.forEach((button: Button) => {
            const node = button.node;
            const handler = (this as any)[node.name] as ButtonHandler | undefined;
            if (typeof handler !== "function") return;

            this.unregisterButtonClick(node);
            button.clickEvents.length = 0;

            const callback = (event?: any) => {
                const clickEvent = event?.target ? event : { target: node, button: event };
                handler.call(this, clickEvent);
            };

            node.on(Button.EventType.CLICK, callback, this);
            this.buttonBindings.push({ node, callback });
        });
    }

    protected registerButtonClick(
        target: string | Node,
        handler: ButtonHandler | string,
        customEventData: string = "",
    ): Button | null {
        const node = this.resolveNode(target);
        if (!node) {
            console.warn(`[UIBase] button node not found: ${this.getTargetName(target)}`);
            return null;
        }

        const button = node.getComponent(Button);
        if (!button) {
            console.warn(`[UIBase] Button component not found: ${this.getRelativePath(node)}`);
            return null;
        }

        const clickHandler = this.resolveHandler(handler);
        if (!clickHandler) {
            console.warn(`[UIBase] button handler not found: ${String(handler)}`);
            return null;
        }

        this.unregisterButtonClick(node);
        button.clickEvents.length = 0;

        const callback = (event?: any) => {
            const clickEvent = event?.target ? event : { target: node, button: event };
            clickHandler.call(this, clickEvent, customEventData);
        };
        node.on(Button.EventType.CLICK, callback, this);
        this.buttonBindings.push({ node, callback });

        return button;
    }

    protected registerButtonClicks(configs: UIButtonBindingConfig[]): void {
        configs.forEach((config) => {
            this.registerButtonClick(config.path, config.handler, config.customEventData || "");
        });
    }

    protected unregisterButtonClick(target: string | Node): void {
        const node = this.resolveNode(target);
        if (!node) return;

        for (let i = this.buttonBindings.length - 1; i >= 0; i--) {
            const binding = this.buttonBindings[i];
            if (binding.node !== node) continue;

            node.off(Button.EventType.CLICK, binding.callback, this);
            this.buttonBindings.splice(i, 1);
        }
    }

    protected clearButtonBindings(): void {
        this.buttonBindings.forEach((binding) => {
            if (binding.node?.isValid) {
                binding.node.off(Button.EventType.CLICK, binding.callback, this);
            }
        });
        this.buttonBindings.length = 0;
    }



    private resolveNode(target: string | Node): Node | null {
        if (typeof target !== "string") return target;
        return this.getChildByPath(this.node, target);
    }

    private resolveHandler(handler: ButtonHandler | string): ButtonHandler | null {
        if (typeof handler === "function") return handler;

        const method = (this as any)[handler];
        return typeof method === "function" ? method : null;
    }

    private collectNodeTreeInfoLite(parent: Node, nodes: Map<string, Node>): void {
        parent.children.forEach((child) => {
            if (this.hasOtherUIBase(child)) return;

            if (child.name) {
                if (nodes.has(child.name)) {
                    // console.warn(`[UIBase] 检测到重名节点: ${child.name}，可能会导致 getNode 检索错误`);
                } else {
                    nodes.set(child.name, child);
                }
            }

            this.collectNodeTreeInfoLite(child, nodes);
        });
    }

    private collectOwnedButtons(parent: Node, buttons: Button[]): void {
        const button = parent.getComponent(Button);
        if (button) buttons.push(button);

        parent.children.forEach((child) => {
            if (this.hasOtherUIBase(child)) return;
            this.collectOwnedButtons(child, buttons);
        });
    }

    private hasOtherUIBase(node: Node): boolean {
        return node.components.some((component) => component instanceof UIBase && component !== this);
    }

    private getTargetName(target: string | Node): string {
        return typeof target === "string" ? target : this.getRelativePath(target);
    }

    private getPathName(node: Node, includeSiblingIndex: boolean): string {
        if (!includeSiblingIndex || !this.hasSameNameSiblings(node)) {
            return node.name;
        }

        return `${node.name}[${this.getSiblingIndex(node)}]`;
    }

    private getSiblingIndex(node: Node): number {
        if (!node.parent) {
            return -1;
        }

        return node.parent.children.indexOf(node);
    }

    private hasSameNameSiblings(node: Node): boolean {
        if (!node.parent) {
            return false;
        }

        return node.parent.children.filter((sibling) => sibling.name === node.name).length > 1;
    }
}
