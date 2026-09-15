import { _decorator, tween, Vec3, Enum } from "cc";
import { BaseAnim, EasingType, EasingNames } from "./BaseAnim";
const { ccclass, property } = _decorator;

/** 铃铛摇晃动画 - 左右衰减摆动，模拟铃铛被敲击后的晃动效果 */
@ccclass("BellShakeAnim")
export class BellShakeAnim extends BaseAnim {

    @property({ tooltip: "最大摆动角度（度）" })
    swingAngle: number = 15;

    @property({ tooltip: "摆动次数" })
    swingCount: number = 4;

    @property({ tooltip: "每次摆动幅度衰减系数 (0~1)" })
    decayPerSwing: number = 0.55;

    @property({ type: Enum(EasingType), tooltip: "缓动类型" })
    easing: EasingType = EasingType.SineInOut;

    protected onPlay() {
        const totalSwing = this.swingCount;
        // 每次单边摆动的时间 = 总时长 / (摆动次数 * 2)
        const singleSwingDuration = this.duration / (totalSwing * 2);

        let t = tween(this.node);
        const easingFn = this.getEasingFunction(EasingNames[this.easing]);

        // 逐次衰减摆动
        for (let i = 0; i < totalSwing; i++) {
            const decay = Math.pow(this.decayPerSwing, i);
            // 正负交替：先右后左
            const sign = (i % 2 === 0) ? 1 : -1;
            const angle = this.swingAngle * decay * sign;

            t = t.to(singleSwingDuration, {
                eulerAngles: new Vec3(0, 0, angle),
            }, { easing: easingFn });
        }

        // 最终归零
        t = t.to(singleSwingDuration * 0.5, {
            eulerAngles: new Vec3(0, 0, 0),
        }, { easing: "sineOut" });

        if (this.loop) {
            this._tween = t.union().repeatForever().start();
        } else {
            this._tween = t.call(() => {
                this._tween = null;
            }).start();
        }
    }

    protected onStop() {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }
}
