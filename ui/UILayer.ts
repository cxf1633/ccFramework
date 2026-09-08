import { _decorator, EventKeyboard, Input, input, Label, Node, Tween, tween, Vec3 } from "cc";
import { Framework } from "../Framework";
import { UIBase } from "./UIBase";

const { ccclass } = _decorator;

type SecondLabelValueProvider = () => string | number;

export interface UINodeMoveOptions {
    startScaleRatio?: number;
}

interface NodeMoveTweenState {
    tween: Tween<Node>;
    originalScale: Vec3 | null;
}

/**
 * 完整 UI 界面基类。
 * 统一管理只在界面显示期间有效的键盘监听和秒级 Label 定时任务。
 */
@ccclass("UILayer")
export class UILayer extends UIBase {
    private readonly secondLabelTasks: Map<Label, SecondLabelValueProvider> = new Map();
    private readonly movingTweens: Map<Node, NodeMoveTweenState> = new Map();
    private secondLabelTimerRunning = false;

    protected onEnable(): void {
        this.clearLayerResources();
        super.onEnable();
    }

    protected onDisable(): void {
        super.onDisable();
        this.clearLayerResources();
        this.stopAllNodeMoveTweens();
    }

    protected onDestroy(): void {
        this.clearLayerResources();
        super.onDestroy();
        this.stopAllNodeMoveTweens();
    }

    public present(params?: any): void {
        this.clearLayerResources();
        super.present(params);
    }

    public btn_close(): void {
        Framework.UIMgr.close(this.node);
    }
    public btn_mask(): void {
        Framework.UIMgr.close(this.node);
    }

    /**
     * 键盘事件开关。
     * @param on 是否开启键盘监听
     */
    public setKeyboard(on: boolean): void {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.off(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
        if (!on) {
            return;
        }

        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
        input.on(Input.EventType.KEY_PRESSING, this.onKeyPressing, this);
    }

    /** 键按下。 */
    protected onKeyDown(event: EventKeyboard): void { }

    /** 键放开。 */
    protected onKeyUp(event: EventKeyboard): void { }

    /** 键长按。 */
    protected onKeyPressing(event: EventKeyboard): void { }

    protected startSecondLabel(
        target: string | Node | null | undefined | Label,
        valueProvider: SecondLabelValueProvider,
    ): void {
        const label = target instanceof Label
            ? target
            : (typeof target === "string" ? this.getNode(target) : target)?.getComponent(Label);
        if (!label?.isValid) {
            return;
        }

        this.secondLabelTasks.set(label, valueProvider);
        label.string = String(valueProvider());
        if (!this.secondLabelTimerRunning) {
            this.schedule(this.refreshSecondLabels, 1);
            this.secondLabelTimerRunning = true;
        }
    }

    protected stopSecondLabel(target: string | Node | null | undefined | Label): void {
        const label = target instanceof Label
            ? target
            : (typeof target === "string" ? this.getNode(target) : target)?.getComponent(Label);
        if (label) {
            this.secondLabelTasks.delete(label);
        }
        if (this.secondLabelTasks.size === 0) {
            this.stopSecondLabelTimer();
        }
    }

    public moveNodeToNode(
        target: Node | null | undefined,
        to: Node | null | undefined,
        speed: number,
        options: UINodeMoveOptions = {},
    ): void {
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

    private clearLayerResources(): void {
        this.setKeyboard(false);
        this.secondLabelTasks.clear();
        this.stopSecondLabelTimer();
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

    private getNodePositionInTargetParent(
        target: Node | null | undefined,
        positionNode: Node | null | undefined,
    ): Vec3 | null {
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

    private refreshSecondLabels(): void {
        this.secondLabelTasks.forEach((valueProvider, label) => {
            if (!label.isValid) {
                this.secondLabelTasks.delete(label);
                return;
            }
            label.string = String(valueProvider());
        });
        if (this.secondLabelTasks.size === 0) {
            this.stopSecondLabelTimer();
        }
    }

    private stopSecondLabelTimer(): void {
        if (!this.secondLabelTimerRunning) {
            return;
        }
        this.unschedule(this.refreshSecondLabels);
        this.secondLabelTimerRunning = false;
    }
}
