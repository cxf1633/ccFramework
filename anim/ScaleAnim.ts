import { _decorator, tween, Vec3, Tween, Enum } from 'cc';
import { BaseAnim, EasingType, EasingNames } from './BaseAnim';
const { ccclass, property } = _decorator;

@ccclass('ScaleAnim')
export class ScaleAnim extends BaseAnim {

    @property
    from: Vec3 = new Vec3(0, 0, 0);

    @property
    to: Vec3 = new Vec3(1, 1, 1);

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.BackOut;

    protected onPlay(): void {
        this.node.setScale(this.from);

        // 使用 easing 对象获取缓动函数
        const easingFunc = this.getEasingFunction(EasingNames[this.easing]);

        const t = tween(this.node)
            .to(this.duration,
                { scale: this.to },
                { easing: easingFunc });

        if (this.loop) {
            this._tween = t.union().repeatForever().start();
        } else {
            this._tween = t.start();
        }
    }

    protected onStop(): void {
        Tween.stopAllByTarget(this.node);
        this._tween = null;
    }
}
