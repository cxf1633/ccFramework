import { _decorator } from 'cc';
import { Framework } from '../Framework';
import { UIBase } from './UIBase';

const { ccclass } = _decorator;

export type UIDialogAction = () => void | boolean | Promise<void | boolean>;

export interface UIDialogParams {
    /** 点击确定后的外部回调；返回 false 时不关闭弹窗。 */
    okFunc?: UIDialogAction;
    /** 点击取消后的外部回调；返回 false 时不关闭弹窗。 */
    cancelFunc?: UIDialogAction;
    /** 各弹窗可直接附带自己的业务参数。 */
    [key: string]: any;
}

/**
 * 强交互弹窗基类。
 *
 * 子类可覆写 onDialogConfirm/onDialogCancel 执行自身逻辑，再由传入的回调补充调用方逻辑。
 * 自身逻辑或外部回调返回 false 时保留弹窗，其余情况自动关闭。
 */
@ccclass('UIDialog')
export class UIDialog extends UIBase {
    private okFunc: UIDialogAction | null = null;
    private cancelFunc: UIDialogAction | null = null;
    private actionPending: boolean = false;

    protected onShow(params?: UIDialogParams): void {
        this.actionPending = false;
        this.okFunc = typeof params?.okFunc === 'function' ? params.okFunc : null;
        this.cancelFunc = typeof params?.cancelFunc === 'function' ? params.cancelFunc : null;
        this.onDialogShow(params);
    }

    protected onHide(): void {
        this.actionPending = false;
        this.okFunc = null;
        this.cancelFunc = null;
        this.onDialogHide();
    }

    public btn_close(): void {
        Framework.UIMgr.close(this.node);
    }

    public async btn_ok(): Promise<void> {
        await this.runDialogAction(this.onDialogConfirm, this.okFunc);
    }

    public async btn_cancel(): Promise<void> {
        await this.runDialogAction(this.onDialogCancel, this.cancelFunc);
    }

    /** 弹窗每次显示时调用，子类在这里刷新自己的界面。 */
    protected onDialogShow(params?: UIDialogParams): void { }

    /** 确定按钮的子类业务逻辑；返回 false 可阻止关闭及外部确定回调。 */
    protected onDialogConfirm(): void | boolean | Promise<void | boolean> { }

    /** 取消按钮的子类业务逻辑；返回 false 可阻止关闭及外部取消回调。 */
    protected onDialogCancel(): void | boolean | Promise<void | boolean> { }

    /** 弹窗隐藏时调用，子类在这里清理自己的临时状态。 */
    protected onDialogHide(): void { }

    private async runDialogAction(
        dialogAction: UIDialogAction,
        externalAction: UIDialogAction | null,
    ): Promise<void> {
        if (this.actionPending) {
            return;
        }

        this.actionPending = true;
        try {
            const dialogResult = await dialogAction.call(this);
            if (dialogResult === false) {
                return;
            }

            const externalResult = await externalAction?.();
            if (externalResult !== false && this.isValid && this.node?.isValid) {
                this.btn_close();
            }
        } finally {
            this.actionPending = false;
        }
    }
}
