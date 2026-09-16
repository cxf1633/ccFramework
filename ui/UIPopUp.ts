import { _decorator } from 'cc';
import { ScaleAnim } from '../anim/ScaleAnim';
import { UILayer } from './UILayer';

const { ccclass } = _decorator;

/** 弹窗基类 - 关闭时反向播放 root 上的 ScaleAnim，完成后关闭界面。 */
@ccclass('UIPopUp')
export class UIPopUp extends UILayer {
    private closingScaleAnim: ScaleAnim | null = null;

    protected override onDisable(): void {
        this.closingScaleAnim?.stop();
        this.closingScaleAnim = null;
        super.onDisable();
    }

    public override present(params?: any): void {
        // 退场期间重新打开时，取消旧关闭回调并恢复显示。
        if (this.closingScaleAnim?.isValid) {
            this.closingScaleAnim.stop();
            this.closingScaleAnim.node.setScale(this.closingScaleAnim.to);
        }
        this.closingScaleAnim = null;
        super.present(params);
    }

    public override btn_close(): void {
        if (this.closingScaleAnim || !this.node.activeInHierarchy) {
            return;
        }
        const scaleAnim = this.getNode('root')?.getComponent(ScaleAnim);
        if (!scaleAnim?.enabledInHierarchy) {
            super.btn_close();
            return;
        }
        this.closingScaleAnim = scaleAnim;
        scaleAnim.onPlay(() => {
            if (this.closingScaleAnim !== scaleAnim || !this.isValid || !this.node.activeInHierarchy) {
                return;
            }
            this.closingScaleAnim = null;
            super.btn_close();
        }, true);
    }

    public override btn_mask(): void {
        this.btn_close();
    }
}
