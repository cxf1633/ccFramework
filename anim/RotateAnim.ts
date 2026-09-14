import { _decorator, Vec3, tween, Enum } from 'cc';
import { BaseAnim, EasingType, EasingNames } from './BaseAnim';
const { ccclass, property } = _decorator;

@ccclass('RotateAnim')
export class RotateAnim extends BaseAnim {

    @property
    angle: number = 360; // 旋转角度

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.Linear; // 缓动

    onPlay() {
        const createTween = () => {
            return tween(this.node)
                .by(this.duration, { eulerAngles: new Vec3(0, 0, this.angle) }, { easing: this.getEasingFunction(EasingNames[this.easing]) });
        };

        if (this.loop) {
            this._tween = tween(this.node)
                .repeatForever(
                    createTween()
                )
                .start();
        } else {
            this._tween = createTween()
                .call(() => {
                    this._tween = null;
                })
                .start();
        }
    }

    onStop() {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }
}
