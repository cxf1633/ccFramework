import { _decorator, Button, Component, EventKeyboard, Input, input, Label, Node, Tween, tween, Vec3 } from "cc";
import { Framework } from "../Framework";
import { NodePathUtils } from "../utils/NodePathUtils";

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

export interface UINodeMoveOptions {
    startScaleRatio?: number;
}

interface NodeMoveTweenState {
    tween: Tween<Node>;
    originalScale: Vec3 | null;
}

@ccclass("UIBase")
export class UIBase extends Component {
    public nodes: Map<string, Node> = null!;
    private readonly buttonBindings: ButtonBinding[] = [];
    private readonly movingTweens: Map<Node, NodeMoveTweenState> = new Map();
    private showParams: any = null;


    protected __preload(): void {
        this.nodeTreeInfoLite();
        this.bindButtonsByNodeName();

    }
    protected onLoad(): void {
        this.onInit();
    }

    protected onDestroy(): void {
        this.onDisable();
        this.onDispose();
        this.stopAllNodeMoveTweens();
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
        this.stopAllNodeMoveTweens();
    }
    protected onInit(): void {
        // 子类自己的初始化逻辑
    }
    protected onDispose(): void {
        // 子类自己的销毁逻辑
    }
    protected onBeforeRemove(params?: any): void {

    }
    protected onRemoved(params?: any): void {

    }
    protected onShow(params?: any): void {

    }
    protected onHide(): void {

    }

    public btn_close(): void {
        Framework.UIMgr.close(this.node);
    }

    /**
     * 键盘事件开关
     * @param on 打开键盘事件为true
     */
    setKeyboard(on: boolean) {
        if (on) {
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
            input.on(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        }
        else {
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
            input.off(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        }
    }

    /** 键按下 */
    protected onKeyDown(event: EventKeyboard) { }

    /** 键放开 */
    protected onKeyUp(event: EventKeyboard) { }

    /** 键长按 */
    protected onKeyPressing(event: EventKeyboard) { }

    public setShowParams(params?: any): void {
        this.showParams = params;
    }

    public getNode(name: string): Node | null {
        if (this.nodes) {
            const node = this.nodes.get(name);
            if (node) return node;
        }

        return this.findNodeByPath(name);
    }

    protected setLabelText(target: string | Node | null | undefined, text: string | number): void {
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

    public moveNodeToNode(target: Node | null | undefined, to: Node | null | undefined, speed: number, options: UINodeMoveOptions = {}): void {
        const targetPosition = this.getNodePositionInTargetParent(target, to);
        if (!target?.isValid || !targetPosition) {
            return;
        }

        this.stopNodeMoveTween(target);

        const startPosition = target.position.clone();
        const distance = Vec3.distance(startPosition, targetPosition);
        if (distance <= 0 || speed <= 0) {
            target.setPosition(targetPosition);
            return;
        }

        const originalScale = this.getMoveOriginalScale(target, options);
        const moveProps = originalScale
            ? { position: targetPosition, scale: originalScale }
            : { position: targetPosition };
        const moveTween = tween(target)
            .to(distance / speed, moveProps, { easing: "linear" })
            .call(() => {
                const moveState = this.movingTweens.get(target);
                if (moveState?.tween === moveTween) {
                    this.movingTweens.delete(target);
                }
            })
            .start();
        this.movingTweens.set(target, { tween: moveTween, originalScale });
    }

    public setNodeToNode(target: Node | null | undefined, to: Node | null | undefined): void {
        const position = this.getNodePositionInTargetParent(target, to);
        if (!target?.isValid || !position) {
            return;
        }

        this.stopNodeMoveTween(target);
        target.setPosition(position);
    }

    private stopNodeMoveTween(target: Node | null | undefined): void {
        if (!target) {
            return;
        }

        const moveState = this.movingTweens.get(target);
        if (!moveState) {
            return;
        }

        moveState.tween.stop();
        this.movingTweens.delete(target);
        if (moveState.originalScale && target.isValid) {
            target.setScale(moveState.originalScale);
        }
    }

    private stopAllNodeMoveTweens(): void {
        this.movingTweens.forEach((moveState, target) => {
            moveState.tween.stop();
            if (moveState.originalScale && target.isValid) {
                target.setScale(moveState.originalScale);
            }
        });
        this.movingTweens.clear();
    }

    private getMoveOriginalScale(target: Node, options: UINodeMoveOptions): Vec3 | null {
        const startScaleRatio = Math.max(0, options.startScaleRatio ?? 1);
        if (!Number.isFinite(startScaleRatio) || startScaleRatio === 1) {
            return null;
        }

        const originalScale = target.scale.clone();
        target.setScale(
            originalScale.x * startScaleRatio,
            originalScale.y * startScaleRatio,
            originalScale.z,
        );
        return originalScale;
    }

    private getNodePositionInTargetParent(target: Node | null | undefined, positionNode: Node | null | undefined): Vec3 | null {
        if (!target?.isValid || !positionNode?.isValid) {
            return null;
        }

        const position = new Vec3();
        const parent = target.parent;
        if (!parent?.isValid) {
            return positionNode.worldPosition.clone();
        }

        parent.inverseTransformPoint(position, positionNode.worldPosition);
        return position;
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
            console.warn(`[UIBase] Button component not found: ${NodePathUtils.getRelativePath(node, this.node)}`);
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
        return typeof target === "string" ? target : NodePathUtils.getRelativePath(target, this.node);
    }
}
