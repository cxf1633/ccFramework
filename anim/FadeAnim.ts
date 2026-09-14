import { _decorator, tween, UIOpacity } from 'cc';
import { BaseAnim } from './BaseAnim';
const { ccclass, property } = _decorator;

@ccclass('FadeAnim')
export class FadeAnim extends BaseAnim {

    @property({ tooltip: '起始透明度（0~255）' })
    from: number = 0;

    @property({ tooltip: '目标透明度（0~255）' })
    to: number = 255;

    @property({ tooltip: '到达目标后停留的秒数，<=0 表示不淡出' })
    stayTime: number = 0; // 停留时间（<=0 不淡出）

    @property({ tooltip: '节点启用时立即把透明度设为起始值，避免延迟期间露出原透明度' })
    applyOnEnable: boolean = true; // onEnable 立即把透明度设为 from，避免延迟/动画开始前露出原透明度

    private _opacity: UIOpacity | null = null;

    onEnable() {
        if (this.applyOnEnable) {
            this.getOrAddOpacity().opacity = this.from;
        }
        super.onEnable();
    }

    private getOrAddOpacity(): UIOpacity {
        if (!this._opacity || !this._opacity.isValid) {
            this._opacity = this.node.getComponent(UIOpacity);
            if (!this._opacity) {
                this._opacity = this.node.addComponent(UIOpacity);
            }
        }
        return this._opacity;
    }

    protected onPlay() {

        this._opacity = this.getOrAddOpacity();

        this._opacity.opacity = this.from;

        this._tween = tween(this._opacity)
            .to(this.duration, { opacity: this.to });

        // 有停留时间 → 再淡出
        if (this.stayTime > 0) {
            this._tween = this._tween
                .delay(this.stayTime)
                .to(this.duration, { opacity: this.from });
        }

        // 循环逻辑
        if (this.loop) {

            if (this.stayTime > 0) {
                // 淡入 → 停留 → 淡出 → 循环
                this._tween = this._tween.union().repeatForever();
            } else {
                // 只有淡入 → 每次都从 from 开始
                this._tween = tween(this._opacity)
                    .set({ opacity: this.from })
                    .to(this.duration, { opacity: this.to })
                    .union()
                    .repeatForever();
            }
        }

        this._tween.start();
    }

    protected onStop() {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }
}
