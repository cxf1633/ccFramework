import { _decorator, EventKeyboard, Input, input, Label, Node } from "cc";
import { Framework } from "../Framework";
import { UIBase } from "./UIBase";

const { ccclass } = _decorator;

type SecondLabelValueProvider = () => string | number;

/**
 * 完整 UI 界面基类。
 * 统一管理只在界面显示期间有效的键盘监听和秒级 Label 定时任务。
 */
@ccclass("UILayer")
export class UILayer extends UIBase {
    private readonly secondLabelTasks: Map<Label, SecondLabelValueProvider> = new Map();
    private secondLabelTimerRunning = false;

    protected onEnable(): void {
        this.clearLayerResources();
        super.onEnable();
    }

    protected onDisable(): void {
        super.onDisable();
        this.clearLayerResources();
    }

    protected onDestroy(): void {
        this.clearLayerResources();
        super.onDestroy();
    }

    public present(params?: any): void {
        this.clearLayerResources();
        super.present(params);
    }

    public btn_close(): void {
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

    private clearLayerResources(): void {
        this.setKeyboard(false);
        this.secondLabelTasks.clear();
        this.stopSecondLabelTimer();
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
