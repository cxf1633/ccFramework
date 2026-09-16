import { _decorator, tween, Vec3, Tween, Enum } from 'cc';
import { BaseAnim, EasingType } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 果冻跳动画 - 带弹性伸缩的弹跳效果 */
@ccclass('JellyJumpAnim')
export class JellyJumpAnim extends BaseAnim {

    @property({ tooltip: '起始缩放（入口时的缩放值）' })
    scaleIn: Vec3 = new Vec3(0.5, 0.5, 1); // 起始缩放（入口）

    @property({ tooltip: '节点启用时立即设为起始缩放，避免动画开始前闪现' })
    applyOnEnable: boolean = true;

    @property({ tooltip: '落地压扁程度，>1 更扁' })
    overshootScale: number = 1.15; // 落地压扁程度 > 1 = 更扁

    @property({ tooltip: '落地后的回弹抖动次数' })
    wobbleCount: number = 3; // 回弹抖动次数

    @property({ tooltip: '弹起高度比例（相对 scaleY 的增量比例）' })
    jumpHeight: number = 0.25; // 弹起高度比例（相对scaleY增量）

    @property({ tooltip: '循环时两次播放之间的间隔（秒）' })
    loopInterval: number = 0.5;      // 循环间隔（秒）

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.ElasticOut; // 主缓动

    private _originScale: Vec3 = new Vec3(1, 1, 1);

    protected onLoad(): void {
        this._originScale = this.node.getScale().clone();
    }

    public override onEnable(): void {
        if (this.applyOnEnable) {
            this.node.setScale(this.scaleIn);
        }
        super.onEnable();
    }

    protected onPlay(): void {
        const dur = this.duration;
        const os = this.overshootScale;           // 落地压扁系数
        const jh = 1 + this.jumpHeight;           // 弹起 scaleY
        const sxIn = this.scaleIn;

        // 以 _originScale 为基准，计算各阶段目标
        const baseX = this._originScale.x;
        const baseY = this._originScale.y;
        const baseZ = this._originScale.z;

        this.node.setScale(sxIn);

        // 阶段1: 弹起（从缩放到拉伸）
        // 阶段2: 落地压扁
        // 阶段3~N: 逐步衰减的抖动 → 归位

        const elasticFn = this.getEasingFunction('elasticOut');
        const bounceFn = this.getEasingFunction('bounceOut');

        const t = tween(this.node);

        // 弹起 + 落地默认用弹性缓动完成
        t.to(dur * 0.4, {
            scale: new Vec3(baseX / Math.sqrt(jh), baseY * jh, baseZ),
        }, { easing: elasticFn })
        .to(dur * 0.25, {
            scale: new Vec3(baseX * os, baseY / os, baseZ),
        }, { easing: bounceFn });

        // 剩余抖动衰减
        const remainRatio = 0.35;
        const wbCount = Math.max(this.wobbleCount, 1);
        const wbDuration = dur * remainRatio / wbCount;
        let wobbleX = baseX;
        let wobbleY = baseY;

        for (let i = 0; i < wbCount; i++) {
            const factor = 1 - (i / wbCount) * 0.7; // 抖动幅度递减
            const sign = (i % 2 === 0) ? 1 : -1;
            wobbleX = baseX * (1 + sign * 0.04 * factor);
            wobbleY = baseY * (1 - sign * 0.05 * factor);

            t.to(wbDuration, {
                scale: new Vec3(wobbleX, wobbleY, baseZ),
            }, { easing: 'sineOut' });
        }

        // 最终归位
        t.to(wbDuration * 0.5, {
            scale: this._originScale,
        }, { easing: 'sineOut' });

        if (this.loop) {
            t.union().delay(this.loopInterval).repeatForever().start();
        } else {
            t.start();
        }
    }

    protected onStop(): void {
        Tween.stopAllByTarget(this.node);
    }
}
