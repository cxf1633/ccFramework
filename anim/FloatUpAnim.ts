import { _decorator, tween, Vec3, Tween, Enum } from 'cc';
import { BaseAnim, EasingType, EasingNames } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 上下浮动动画 - 节点在垂直方向来回浮动，可伴随弹性伸缩 */
@ccclass('FloatUpAnim')
export class FloatUpAnim extends BaseAnim {

    @property({ tooltip: '上下浮动幅度（像素）' })
    floatDistance: number = 10;               // 浮动幅度（像素）

    @property({ tooltip: '缩放脉动幅度，0 表示浮动时不缩放' })
    scalePulse: number = 0;                    // 缩放脉动幅度（0 = 不缩放）

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.SineInOut;          // 缓动类型

    private _originPos: Vec3 = new Vec3();
    private _originScale: Vec3 = new Vec3(1, 1, 1);

    protected onLoad(): void {
        this._originPos = this.node.getPosition().clone();
        this._originScale = this.node.getScale().clone();
    }

    protected onPlay(): void {
        const easingFn = this.getEasingFunction(EasingNames[this.easing]);

        // 向上半程
        const upTarget = this._originPos.clone().add(new Vec3(0, this.floatDistance, 0));
        let upScale: Vec3 | undefined;
        if (this.scalePulse > 0) {
            upScale = new Vec3(
                this._originScale.x + this.scalePulse,
                this._originScale.y - this.scalePulse,
                this._originScale.z
            );
        }

        const t = tween(this.node);
        const upTween = upScale
            ? tween(this.node).to(this.duration, { position: upTarget, scale: upScale }, { easing: easingFn })
            : tween(this.node).to(this.duration, { position: upTarget }, { easing: easingFn });

        // 向下回到原点
        const downTween = upScale
            ? tween(this.node).to(this.duration, { position: this._originPos, scale: this._originScale }, { easing: easingFn })
            : tween(this.node).to(this.duration, { position: this._originPos }, { easing: easingFn });

        t.sequence(upTween, downTween);

        if (this.loop) {
            t.repeatForever().start();
        } else {
            t.start();
        }
    }

    protected onStop(): void {
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this._originPos);
        this.node.setScale(this._originScale);
    }
}
