import { _decorator, tween, Vec3, Tween, Enum } from 'cc';
import { BaseAnim, EasingType, EasingNames } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 缩放动画 - 在起始与目标缩放之间过渡，支持反向播放 */
@ccclass('ScaleAnim')
export class ScaleAnim extends BaseAnim {

    @property({ tooltip: '起始缩放' })
    from: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: '目标缩放' })
    to: Vec3 = new Vec3(1, 1, 1);

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.BackOut;

    @property({ type: Enum(EasingType), tooltip: '反向播放的缓动类型' })
    reverseEasing: EasingType = EasingType.QuadIn;

    /** 立即播放缩放；reverse 为 true 时从 to 播到 from，反向只播放一次。 */
    public onPlay(onComplete?: () => void, reverse: boolean = false): void {
        this.stop();
        if (!this.enabledInHierarchy) {
            return;
        }

        this._isPlaying = true;
        this.node.setScale(reverse ? this.to : this.from);

        // 使用 easing 对象获取缓动函数
        const easingType = reverse ? this.reverseEasing : this.easing;
        const easingFunc = this.getEasingFunction(EasingNames[easingType]);

        const t = tween(this.node)
            .to(this.duration,
                { scale: reverse ? this.from : this.to },
                { easing: easingFunc });

        if (this.loop && !reverse) {
            this._tween = t.union().repeatForever().start();
        } else {
            this._tween = t.call(() => {
                this._isPlaying = false;
                this._tween = null;
                onComplete?.();
            }).start();
        }
    }

    protected onStop(): void {
        Tween.stopAllByTarget(this.node);
        this._tween = null;
    }
}
