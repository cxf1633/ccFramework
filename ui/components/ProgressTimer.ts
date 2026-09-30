import { _decorator, Component, Node, Sprite, Label, math, UITransform, Vec3 } from 'cc';
import { Color } from 'cc';
const { ccclass, property } = _decorator;


const ParamsConfig = {

    cdYellowColorPecent: 0.4,
    cdRedColorPecent: 0.2,

}

/** 圆点定位换算用的临时向量，避免每帧新建对象 */
const _ballWorldPos = new Vec3();
const _ballRingLocalPos = new Vec3();
const _ballParentLocalPos = new Vec3();

@ccclass('ProgressTimer')
export class ProgressTimer extends Component {
    @property({ type: [Sprite], tooltip: '进度条图片数组（需设置为 FILLED 模式）' })
    public progressSprites: Sprite[] = [];

    @property({ tooltip: '是否是半圆进度条' })
    public isSemiCircle: boolean = false;

    @property({ type: Label, tooltip: '可选：显示数值的文本' })
    public timeLabel: Label = null!;

    /** 数值后缀：例如头像上的暂离倒计时填 "s"，显示成 12s；留空就是纯数字 */
    @property({ tooltip: '数值后缀（例如 s），留空为纯数字' })
    public timeLabelSuffix: string = '';

    /**
     * 可选：跟随圆形进度走的圆点节点（挂在小球绕着圆环转的效果上）。
     * 一般和圆环同级（都挂在 NodeCd 下），父节点不同也能用：位置按世界坐标换算过去。
     */
    @property({ type: Node, tooltip: '可选：跟随圆形进度走的圆点节点（如 img_countdown_ball）；留空则不处理' })
    public ballNode: Node = null!;

    /** 圆点参照的圆环 Sprite；留空自动取 progressSprites 里第一个激活的 */
    @property({ type: Sprite, tooltip: '圆点参照的圆环 Sprite：留空自动取 progressSprites 里第一个激活的' })
    public ballFollowSprite: Sprite = null!;

    /** 圆点绕行半径（像素）；0 = 自动按圆点在预制体里摆放的位置到圆心的距离算 */
    @property({ tooltip: '圆点绕行半径（像素）：0 = 自动用圆点在预制体里摆放的位置到圆心的距离（美术摆在哪条半径上就绕哪一圈）' })
    public ballRadius: number = 0;

    /** 圆点额外的角度偏移（度，顺时针为正） */
    @property({ tooltip: '圆点额外角度偏移（度，顺时针为正），用于微调圆点相对进度前沿的位置' })
    public ballAngleOffset: number = 0;

    private _leftTime: number = 0;
    private _totalTime: number = 0;
    private _currentTime: number = 0;
    private _isCounting: boolean = false;
    private _isCountDown: boolean = true;
    private _callback: Function | null = null;
    private tempProgress = 0;

    /** 圆点在预制体里摆放位置到圆心的距离（第一次同步前量一次），<=0 表示还没量到 */
    private _ballAuthoredRadius = 0;


    private startColor = new Color().fromHEX("#20c9be");
    private midColor = new Color().fromHEX("#eadf28");
    private endColor = new Color().fromHEX("#af2222");


    update(dt: number) {
        if (!this._isCounting) return;

        if (this._isCountDown) {
            // 倒计时逻辑
            this._currentTime -= dt;
            if (this._currentTime <= 0) {
                this._currentTime = 0;
                this.stop();
                if (this._callback) this._callback();
            }
        } else {
            // 顺时针计时逻辑
            this._currentTime += dt;
            if (this._currentTime >= this._leftTime) {
                this._currentTime = this._leftTime;
                this.stop();
                if (this._callback) this._callback();
            }
        }

        this.updateVisuals();
    }

    /**
     * 开始计时
     * @param duration 总时长（秒）
     * @param isCountDown 是否为倒计时（默认 true）
     * @param onComplete 完成后的回调
     */
    public startTimer(leftTime: number, totalTime: number, onComplete?: Function, isCountDown: boolean = true,) {
        const safeLeftTime = Number.isFinite(leftTime) ? Math.max(0, leftTime) : 0;
        const safeTotalTime = Number.isFinite(totalTime) && totalTime > 0
            ? totalTime
            : safeLeftTime;

        this._totalTime = safeTotalTime;
        this._leftTime = Math.min(safeLeftTime, safeTotalTime);
        this._isCountDown = isCountDown;
        this._currentTime = isCountDown ? this._leftTime : 0;
        this._callback = onComplete || null;
        this._isCounting = this._leftTime > 0 && this._totalTime > 0;

        this.progressSprites.forEach(sprite => {
            sprite.color = this.startColor;
        });

        this.setTimeLabel(true);
        this.updateVisuals();
    }

    public stop() {
        this._isCounting = false;
    }

    public setTimeLabel(bSwitch: boolean) {
        if (this.timeLabel) {
            this.timeLabel.node.active = bSwitch;
        }
    }

    private updateVisuals() {

        let progress = 0;
        if (this._totalTime > 0 && this._isCountDown) {
            // 1 - 0
            // Logger.trace(` 倒计时 进度 ${this._currentTime} / ${this._totalTime}`)
            progress = this._currentTime / this._totalTime;
        }
        else if (this._totalTime > 0) {
            // 0  -  -1
            progress = (this._totalTime - this._currentTime) / this._totalTime;
        }
        this.tempProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
        // 基础进度比例 (0 到 1)


        // 如果是半圆，将 0~1 映射到 0~0.5
        const finalFillRange = this.isSemiCircle ? this.tempProgress * 0.5 : this.tempProgress;

        this.progressSprites.forEach(sprite => {
            if (sprite) {
                sprite.fillRange = finalFillRange;

                // 实现颜色渐变过渡
                let targetColor: math.Color;

                if (this.tempProgress <= ParamsConfig.cdRedColorPecent) {
                    // 低于20%，保持红色
                    targetColor = this.endColor;
                } else if (this.tempProgress <= ParamsConfig.cdYellowColorPecent) {
                    // 20%~40%，从红色过渡到黄色
                    const t = (this.tempProgress - ParamsConfig.cdRedColorPecent) /
                        (ParamsConfig.cdYellowColorPecent - ParamsConfig.cdRedColorPecent);
                    targetColor = this.lerpColor(this.endColor, this.midColor, t);
                } else {
                    // 高于40%，从黄色过渡到绿色
                    const t = (this.tempProgress - ParamsConfig.cdYellowColorPecent) /
                        (1 - ParamsConfig.cdYellowColorPecent);
                    // targetColor = this.lerpColor(math.Color.YELLOW, math.Color.GREEN, t);
                    targetColor = this.lerpColor(this.midColor, this.startColor, t);
                }

                // 设置颜色
                sprite.color = targetColor;
            }

        });

        if (this.timeLabel) {
            this.timeLabel.string = `${Math.floor(this._currentTime)}${this.timeLabelSuffix || ''}`;
        }

        // 圆点贴在进度前沿上（没有配置 ballNode 时什么都不做）
        this.updateBallPosition();
    }

    /**
     * 让圆点贴在圆形进度的「前沿」上绕圈（进度 1 在起跑线，进度 0 转完一圈回到起跑线）。
     *
     * 角度算法和引擎的径向填充（cc 的 radial-filled 组装器）完全一致：
     * fillStart / fillRange 都是「圈数」，乘 2π 得到节点本地坐标下的数学角
     * （0 弧度 = 圆心正右方，逆时针为正），被填充的扇形就是 fillStart → fillStart + fillRange 这一段，
     * 所以前沿角度 = (fillStart + fillRange) * 2π。
     * 例：圆环 fillStart = 0.25（从正上方开始）、进度 1 时 fillRange = 1 → 前沿在正上方；
     * 倒计时里 fillRange 由 1 减到 0，圆点就从正上方顺时针转一圈。
     */
    private updateBallPosition(): void {
        const ballNode = this.ballNode;
        if (!ballNode?.isValid) {
            return;
        }

        const ringSprite = this.resolveBallFollowSprite();
        const ringTransform = ringSprite?.node?.getComponent(UITransform) ?? null;
        const ballParentTransform = ballNode.parent?.getComponent(UITransform) ?? null;

        if (!ringSprite || !ringTransform || !ballParentTransform) {
            return;
        }

        // 和引擎一样处理负的 fillRange：起点前移、范围取正（取正后前沿就是 fillStart + fillRange）
        let fillStart = ringSprite.fillStart;
        let fillRange = ringSprite.fillRange;
        if (fillRange < 0) {
            fillStart += fillRange;
            fillRange = -fillRange;
        }

        // 圆心在圆环节点本地坐标里的位置：fillCenter = (0.5, 0.5) + 锚点 (0.5, 0.5) 时就是 (0, 0)
        const fillCenter = ringSprite.fillCenter;
        const centerX = ringTransform.width * (fillCenter.x - ringTransform.anchorX);
        const centerY = ringTransform.height * (fillCenter.y - ringTransform.anchorY);

        const radius = this.resolveBallRadius(ringTransform, ballParentTransform, ballNode, centerX, centerY);
        const angle = (fillStart + fillRange) * Math.PI * 2 + this.ballAngleOffset * Math.PI / 180;

        // 圆环本地 → 世界 → 圆点父节点本地：圆环被缩放/旋转、圆点挂在不同父节点下都不会错位
        ringTransform.convertToWorldSpaceAR(
            _ballWorldPos.set(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0),
            _ballWorldPos,
        );
        ballNode.setPosition(ballParentTransform.convertToNodeSpaceAR(_ballWorldPos, _ballParentLocalPos));
    }

    /** 圆点参照的圆环 Sprite：优先用 Inspector 指定的，否则取 progressSprites 里第一个激活的 */
    private resolveBallFollowSprite(): Sprite | null {
        if (this.ballFollowSprite?.isValid) {
            return this.ballFollowSprite;
        }

        const sprites = this.progressSprites ?? [];
        return sprites.find((sprite) => !!sprite?.isValid && sprite.node.activeInHierarchy)
            ?? sprites.find((sprite) => !!sprite?.isValid)
            ?? null;
    }

    /**
     * 圆点绕行半径：Inspector 上填了就用填的；没填就量一次「圆点在预制体里摆放的位置到圆心的距离」，
     * 也就是美术把圆点摆在哪条半径上、代码就绕哪条半径转，不需要手填数字。
     */
    private resolveBallRadius(
        ringTransform: UITransform,
        ballParentTransform: UITransform,
        ballNode: Node,
        centerX: number,
        centerY: number,
    ): number {
        if (this.ballRadius > 0) {
            return this.ballRadius;
        }

        if (this._ballAuthoredRadius <= 0) {
            // 首次同步时圆点还停在美术摆的位置上，量一次即可（父节点本地 → 世界 → 圆环本地）
            ballParentTransform.convertToWorldSpaceAR(ballNode.position, _ballWorldPos);
            ringTransform.convertToNodeSpaceAR(_ballWorldPos, _ballRingLocalPos);

            const dx = _ballRingLocalPos.x - centerX;
            const dy = _ballRingLocalPos.y - centerY;
            this._ballAuthoredRadius = Math.sqrt(dx * dx + dy * dy);
        }

        // 圆点本来就摆在圆心（量不出半径）时退回用圆环节点尺寸的一半
        return this._ballAuthoredRadius > 0
            ? this._ballAuthoredRadius
            : Math.min(ringTransform.width, ringTransform.height) * 0.5;
    }

    /**
     * 线性插值颜色
     */
    private lerpColor(color1: math.Color, color2: math.Color, t: number): math.Color {
        t = Math.max(0, Math.min(1, t));
        const r = color1.r + (color2.r - color1.r) * t;
        const g = color1.g + (color2.g - color1.g) * t;
        const b = color1.b + (color2.b - color1.b) * t;
        return new math.Color(r, g, b, 255);
    }
}
