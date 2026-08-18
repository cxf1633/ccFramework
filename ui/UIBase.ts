import { _decorator, Button, Component, Label, Node } from "cc";

const { ccclass } = _decorator;

type ButtonHandler = (event?: any) => void;

interface ButtonBinding {
    node: Node;
    callback: (event?: any) => void;
}

@ccclass("UIBase")
export class UIBase extends Component {
    private nodes: Map<string, Node> = null!;
    private readonly buttonBindings: ButtonBinding[] = [];
    private showParams: any = null;


    protected __preload(): void {
        this.nodes = new Map();
        const buttons: Button[] = [];
        this.collectOwnedNodeInfo(this.node, buttons);
        this.bindButtonsByNodeName(buttons);

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

        return this.node.getChildByPath(name);
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

    private bindButtonsByNodeName(buttons: Button[]): void {
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
        handler: ButtonHandler,
    ): Button | null {
        const node = this.resolveNode(target);
        if (!node) {
            const targetName = typeof target === "string" ? target : target.getPathInHierarchy();
            console.warn(`[UIBase] button node not found: ${targetName}`);
            return null;
        }

        const button = node.getComponent(Button);
        if (!button) {
            console.warn(`[UIBase] Button component not found: ${node.getPathInHierarchy()}`);
            return null;
        }

        this.unregisterButtonClick(node);
        button.clickEvents.length = 0;

        const callback = (event?: any) => {
            const clickEvent = event?.target ? event : { target: node, button: event };
            handler.call(this, clickEvent);
        };
        node.on(Button.EventType.CLICK, callback, this);
        this.buttonBindings.push({ node, callback });

        return button;
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

    private clearButtonBindings(): void {
        this.buttonBindings.forEach((binding) => {
            if (binding.node?.isValid) {
                binding.node.off(Button.EventType.CLICK, binding.callback, this);
            }
        });
        this.buttonBindings.length = 0;
    }



    private resolveNode(target: string | Node): Node | null {
        if (typeof target !== "string") return target;
        return this.node.getChildByPath(target);
    }

    private collectOwnedNodeInfo(parent: Node, buttons: Button[]): void {
        const button = parent.getComponent(Button);
        if (button) buttons.push(button);

        parent.children.forEach((child) => {
            if (this.hasOtherUIBase(child)) return;

            if (child.name) {
                if (this.nodes.has(child.name)) {
                    // console.warn(`[UIBase] 检测到重名节点: ${child.name}，可能会导致 getNode 检索错误`);
                } else {
                    this.nodes.set(child.name, child);
                }
            }

            this.collectOwnedNodeInfo(child, buttons);
        });
    }

    private hasOtherUIBase(node: Node): boolean {
        return node.components.some((component) => component instanceof UIBase && component !== this);
    }

}
