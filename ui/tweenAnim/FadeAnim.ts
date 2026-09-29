import { _decorator, tween, UIOpacity } from 'cc';
import { BaseAnim } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 淡入淡出动画 - 透明度从起始值过渡到目标值，可停留后淡回 */
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

    /** 立即播放透明度动画；反向从 to 播到 from，不停留、不循环。 */
    public onPlay(onComplete?: () => void, reverse: boolean = false): void {
        this.stop();
        if (!this.enabledInHierarchy) {
            return;
        }
        this._isPlaying = true;
        this._opacity = this.getOrAddOpacity();

        this._opacity.opacity = reverse ? this.to : this.from;

        this._tween = tween(this._opacity)
            .to(this.duration, { opacity: reverse ? this.from : this.to });

        // 有停留时间 → 再淡出
        if (this.stayTime > 0 && !reverse) {
            this._tween = this._tween
                .delay(this.stayTime)
                .to(this.duration, { opacity: this.from });
        }

        // 循环逻辑
        if (this.loop && !reverse) {

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
        } else {
            this._tween = this._tween.call(() => {
                this._isPlaying = false;
                this._tween = null;
                onComplete?.();
            });
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
