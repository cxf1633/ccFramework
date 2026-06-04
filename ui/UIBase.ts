import { _decorator, Button, Component, Node } from "cc";

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

@ccclass("UIBase")
export class UIBase extends Component {
    public nodes: Map<string, Node> = null!;
    private readonly buttonBindings: ButtonBinding[] = [];

    protected onLoad(): void {
        this.nodeTreeInfoLite();
        this.bindButtonsByNodeName();
        this.onInit();
    }

    protected onDestroy(): void {
        this.onDisable();
        this.clearButtonBindings();
        if (this.nodes) {
            this.nodes.clear();
            this.nodes = null!;
        }
    }

    protected onEnable(): void {
        this.onShow();
    }
    protected onDisable(): void {
        this.onHide();
    }
    protected onInit() {
        // 子类自己的初始化逻辑
    }
    protected onDispose() {
        // 子类自己的销毁逻辑
    }
    protected onShow() {

    }
    protected onHide() {

    }

    public getNode(name: string): Node | null {
        if (this.nodes) {
            const node = this.nodes.get(name);
            if (node) return node;
        }

        return this.findNodeByPath(name);
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
            console.warn(`[UIBase] Button component not found: ${this.getNodePath(node)}`);
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
        return this.findNodeByPath(target);
    }

    private resolveHandler(handler: ButtonHandler | string): ButtonHandler | null {
        if (typeof handler === "function") return handler;

        const method = (this as any)[handler];
        return typeof method === "function" ? method : null;
    }

    private findNodeByPath(path: string): Node | null {
        const names = path.split("/").filter(Boolean);
        if (names[0] === this.node.name) names.shift();

        let current: Node | null = this.node;
        for (const name of names) {
            current = current?.getChildByName(name) || null;
            if (!current) return null;
        }

        return current;
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
        return typeof target === "string" ? target : this.getNodePath(target);
    }

    private getNodePath(node: Node): string {
        const names: string[] = [];
        let current: Node | null = node;

        while (current) {
            names.unshift(current.name);
            if (current === this.node) break;
            current = current.parent;
        }

        return names.join("/");
    }
}
