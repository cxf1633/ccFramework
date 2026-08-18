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

    /** 在 Cocos 预加载阶段建立节点索引并完成自动按钮绑定。 */
    protected __preload(): void {
        this.nodes = new Map();
        const buttons: Button[] = [];
        this.collectOwnedNodeInfo(this.node, buttons);
        this.bindButtonsByNodeName(buttons);
    }

    /** 在组件加载时调用子类初始化入口。 */
    protected onLoad(): void {
        this.onInit();
    }

    /** 在节点启用时将当前展示参数传给子类。 */
    protected onEnable(): void {
        this.onShow(this.showParams);
    }

    /** 在节点停用时通知子类处理隐藏逻辑。 */
    protected onDisable(): void {
        this.onHide();
    }

    /** 子类的一次性初始化入口。 */
    protected onInit(): void { }

    /** 子类的最终资源释放入口。 */
    protected onDispose(): void { }

    /** 子类每次显示或刷新界面时的处理入口。 */
    protected onShow(params?: any): void { }

    /** 子类每次隐藏界面时的处理入口。 */
    protected onHide(): void { }

    /** 在组件销毁时释放子类资源、按钮监听和节点索引。 */
    protected onDestroy(): void {
        this.onDispose();
        this.clearButtonBindings();
        if (this.nodes) {
            this.nodes.clear();
            this.nodes = null!;
        }
    }
    /** 保存展示参数；若界面已经显示，则立即刷新界面内容。 */
    public present(params?: any): void {
        const wasActive = this.node.activeInHierarchy;
        this.setShowParams(params);
        if (wasActive) {
            this.onShow(this.showParams);
        }
    }

    /** 保存下一次显示界面时传给 onShow 的参数。 */
    public setShowParams(params?: any): void {
        this.showParams = params;
    }

    /** 为当前组件负责的按钮绑定同名处理函数。 */
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

    /** 解除并清空当前组件注册的全部按钮监听。 */
    private clearButtonBindings(): void {
        this.buttonBindings.forEach((binding) => {
            if (binding.node?.isValid) {
                binding.node.off(Button.EventType.CLICK, binding.callback, this);
            }
        });
        this.buttonBindings.length = 0;
    }

    /** 收集当前组件负责的节点索引和按钮，跳过其他 UIBase 的节点树。 */
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

    /** 判断节点是否由另一个 UIBase 组件独立管理。 */
    private hasOtherUIBase(node: Node): boolean {
        return node.components.some((component) => component instanceof UIBase && component !== this);
    }



    /** 设置目标 Label 文本，节点不存在时忽略。 */
    protected setLabelText(target: string | Node | null | undefined | Label, text: string | number): void {
        const node = typeof target === "string" ? this.getNode(target) : target;
        const label = node?.getComponent(Label);
        if (label) {
            label.string = String(text);
        }
    }

    /** 设置有效节点的显隐状态。 */
    protected setActive(node: Node | null | undefined, active: boolean): void {
        if (node?.isValid) {
            node.active = active;
        }
    }

    /** 为指定按钮注册点击处理函数，并替换已有绑定。 */
    protected registerButtonClick(
        target: string | Node,
        handler: ButtonHandler,
    ): Button | null {
        const node = typeof target === "string" ? this.node.getChildByPath(target) : target;
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

    /** 解除指定按钮由当前组件注册的点击监听。 */
    protected unregisterButtonClick(target: string | Node): void {
        const node = typeof target === "string" ? this.node.getChildByPath(target) : target;
        if (!node) return;

        for (let i = this.buttonBindings.length - 1; i >= 0; i--) {
            const binding = this.buttonBindings[i];
            if (binding.node !== node) continue;

            node.off(Button.EventType.CLICK, binding.callback, this);
            this.buttonBindings.splice(i, 1);
        }
    }



    /** 按节点名称或相对路径查找当前组件负责的节点。 */
    public getNode(name: string): Node | null {
        if (this.nodes) {
            const node = this.nodes.get(name);
            if (node) return node;
        }

        return this.node.getChildByPath(name);
    }
}
