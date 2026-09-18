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

    @property({ type: Enum(EasingType), tooltip: '反向播放的缓动类型' })
    reverseEasing: EasingType = EasingType.SineIn;

    @property({ tooltip: '使用世界坐标移动（默认关 = 局部坐标）' })
    useWorldPosition: boolean = false;

    @property({ tooltip: '节点启用时立即设为起始位置，避免动画开始前闪现' })
    applyOnEnable: boolean = true;

    public override onEnable(): void {
        if (this.applyOnEnable) {
            if (this.useWorldPosition) {
                this.node.setWorldPosition(this.from);
            } else {
                this.node.setPosition(this.from);
            }
        }
        super.onEnable();
    }

    /** 立即播放移动；反向从 to 播到 from，只播放一次。 */
    public onPlay(onComplete?: () => void, reverse: boolean = false): void {
        this.stop();
        if (!this.enabledInHierarchy) {
            return;
        }
        this._isPlaying = true;
        const easingFn = this.getEasingFunction(EasingNames[reverse ? this.reverseEasing : this.easing]);
        const from = reverse ? this.to : this.from;
        const to = reverse ? this.from : this.to;

        let t: Tween<Node>;
        if (this.useWorldPosition) {
            // 世界坐标：起点/终点均按世界坐标理解
            this.node.setWorldPosition(from);
            t = tween(this.node).to(this.duration, { worldPosition: to }, { easing: easingFn });
        } else {
            // 局部坐标（默认）
            this.node.setPosition(from);
            t = tween(this.node).to(this.duration, { position: to }, { easing: easingFn });
        }

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

    /** 立即置于终点，不播放动画；reverse 为 true 时置于起点。 */
    public applyImmediate(reverse: boolean = false): void {
        this.stop();
        const target = reverse ? this.from : this.to;
        if (this.useWorldPosition) {
            this.node.setWorldPosition(target);
        } else {
            this.node.setPosition(target);
        }
    }

    protected onStop(): void {
        Tween.stopAllByTarget(this.node);
        this._tween = null;
    }
}
