import { _decorator, Node, tween, Vec3 } from 'cc';
import { BaseAnim } from './BaseAnim';
const { ccclass, property } = _decorator;

/** 火山喷发动画 - 震颤→膨胀→喷发→后坐 的火山节点动画 */
@ccclass('VolcanoEruptAnim')
export class VolcanoEruptAnim extends BaseAnim {

    @property
    swellScale: number = 1.12;       // 膨胀幅度（喷发前鼓起的最大比例）

    @property
    burstStretch: number = 1.25;     // 喷发瞬间 Y 拉伸系数

    @property
    burstHeight: number = 20;        // 喷发时节点上移像素

    @property
    shakeIntensity: number = 3;      // 震颤幅度（像素）

    @property
    shakeCount: number = 4;          // 预震次数

    @property
    loopInterval: number = 0.5;          // 循环间隔（秒）

    @property(Node)
    emitTarget: Node | null = null;

    private _originScale: Vec3 = new Vec3(1, 1, 1);
    private _originPos: Vec3 = new Vec3(0, 0, 0);
    private _hasOrigin: boolean = false;

    protected onPlay(): void {

        this._originScale = this.node.getScale().clone();
        this._originPos = this.node.getPosition().clone();
        this._hasOrigin = true;

        const dur = this.duration;
        const baseS = this._originScale;
        const baseP = this._originPos;
        const bx = baseS.x, by = baseS.y, bz = baseS.z;

        this.node.setScale(baseS);
        this.node.setPosition(baseP);

        const t = tween(this.node);

        // ── 阶段1：预震 ──
        const shakeRatio = 0.35;
        const tremorCount = Math.max(this.shakeCount, 1);
        const tremorDt = dur * shakeRatio / tremorCount;

        for (let i = 0; i < tremorCount; i++) {
            const factor = 1 + (i / tremorCount) * 0.5;   // 越来越强
            const amp = this.shakeIntensity * factor;
            const sign = (i % 2 === 0) ? 1 : -1;

            t.to(tremorDt * 0.4, {
                position: new Vec3(baseP.x + sign * amp, baseP.y, baseP.z),
                scale: new Vec3(bx * (1 + 0.01 * factor), by * (1 - 0.01 * factor), bz),
            }, { easing: 'sineOut' })
                .to(tremorDt * 0.6, {
                    scale: baseS,
                    position: baseP,
                }, { easing: 'sineOut' });
        }

        // ── 阶段2：膨胀蓄力 ──
        const swellRatio = 0.2;
        t.to(dur * swellRatio, {
            scale: new Vec3(bx * this.swellScale, by * this.swellScale, bz),
        }, { easing: 'quadOut' });

        // ── 阶段3：喷发爆发 ──
        const burstRatio = 0.15;
        t.to(dur * burstRatio, {
            scale: new Vec3(bx / Math.sqrt(this.burstStretch), by * this.burstStretch, bz),
            position: new Vec3(baseP.x, baseP.y + this.burstHeight, baseP.z),
        }, { easing: 'backOut' })
            .call(() => {
                if (this.emitTarget) {
                    this.emitTarget.emit('onTargetPlay');
                }
            })

        // ── 阶段4：后坐+归位 ──
        const recoilRatio = 0.30;
        t.to(dur * recoilRatio * 0.4, {
            scale: new Vec3(bx * 1.06, by * 0.85, bz),
            position: new Vec3(baseP.x, baseP.y - this.burstHeight * 0.3, baseP.z),
        }, { easing: 'quadIn' })
            .to(dur * recoilRatio * 0.6, {
                scale: baseS,
                position: baseP,
            }, { easing: 'elasticOut' });

        if (this.loop) {
            t.delay(this.loopInterval);
            this._tween = t.union().repeatForever();
        } else {
            this._tween = t.call(() => {
                this.restoreOrigin();
                this._isPlaying = false;
                this._tween = null;
            });
        }

        this._tween.start();
    }

    protected onStop(): void {
        this._tween?.stop();
        this._tween = null;
        this.restoreOrigin();
    }

    private restoreOrigin(): void {
        if (!this._hasOrigin) {
            return;
        }
        this.node.setScale(this._originScale);
        this.node.setPosition(this._originPos);
    }
}
