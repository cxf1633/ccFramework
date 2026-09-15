import { _decorator, tween, Vec3, Tween, Enum, Node } from 'cc';
import { BaseAnim, EasingType, EasingNames } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 移动动画 - 节点从起点移动到终点，支持局部坐标和世界坐标 */
@ccclass('MoveAnim')
export class MoveAnim extends BaseAnim {

    @property({ tooltip: '起始位置（局部坐标）' })
    from: Vec3 = new Vec3(0, 0, 0);

    @property({ tooltip: '目标位置（局部坐标）' })
    to: Vec3 = new Vec3(100, 0, 0);

    @property({ type: Enum(EasingType), tooltip: '缓动类型' })
    easing: EasingType = EasingType.SineOut;

    @property({ tooltip: '使用世界坐标移动（默认关 = 局部坐标）' })
    useWorldPosition: boolean = false;

    protected onPlay(): void {
        const easingFn = this.getEasingFunction(EasingNames[this.easing]);

        let t: Tween<Node>;
        if (this.useWorldPosition) {
            // 世界坐标：起点/终点均按世界坐标理解
            this.node.setWorldPosition(this.from);
            t = tween(this.node).to(this.duration, { worldPosition: this.to }, { easing: easingFn });
        } else {
            // 局部坐标（默认）
            this.node.setPosition(this.from);
            t = tween(this.node).to(this.duration, { position: this.to }, { easing: easingFn });
        }

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
