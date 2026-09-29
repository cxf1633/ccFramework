import { ProgressBar, Sprite } from 'cc';
import { Label } from 'cc';
import { Slider } from 'cc';
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SliderBar')
export class SliderBar extends Component {

    @property(Sprite)
    fillSprite: Sprite = null!;

    @property(ProgressBar)
    progressBar: ProgressBar = null!;

    @property(Label)
    progressValLb: Label = null!;

    @property
    animDuration: number = 0.3;

    private slider: Slider | null = null;
    private lastProgress: number = -1;
    private progressVal: number = 0;

    // 动画状态
    private _isAnimating: boolean = false;
    private _animStart: number = 0;
    private _animFrom: number = 0;
    private _animTo: number = 0;
    private _animValFrom: number = 0;
    private _animValTo: number = 0;

    start() {
        this.slider = this.node.getComponent(Slider);
        if (!this.slider) return;

        this.slider.node.on("slide", this._onSliderSlide, this);
        this.updateProgress(this.slider.progress);
    }

    /** @param animated 是否动画过渡（默认 false 保持兼容） */
    setProgress(progress: number, maxProgress: number, animated: boolean = true) {

        if (!this.slider) {
            this.slider = this.node.getComponent(Slider);
        };

        if (!this.slider) return;

        const targetProgress = progress / maxProgress;

        if (animated) {
            this._animStart = 0;
            this._animFrom = this.slider.progress;
            this._animTo = targetProgress;
            this._animValFrom = this.progressVal;
            this._animValTo = progress;
            this._isAnimating = true;
        } else {
            this.slider.progress = targetProgress;
            this.progressVal = progress;
        }
    }

    /** 用户手动拖动时取消动画 */
    private _onSliderSlide() {
        if (this._isAnimating) {
            this._isAnimating = false;
        }
    }

    private updateProgress(progress: number) {
        if (this.lastProgress == progress) return;
        this.lastProgress = progress;
        if (this.fillSprite)
            this.fillSprite.fillRange = progress;
        if (this.progressBar)
            this.progressBar.progress = progress;
        if (this.progressValLb)
            this.progressValLb.string = this.progressVal.toString();
    }

    protected update(dt: number): void {
        if (!this.slider) return;

        if (this._isAnimating) {
            this._animStart += dt;
            const t = Math.min(this._animStart / this.animDuration, 1);
            // ease-out quad
            const eased = 1 - (1 - t) * (1 - t);
            this.slider.progress = this._animFrom + (this._animTo - this._animFrom) * eased;
            this.progressVal = Math.round(this._animValFrom + (this._animValTo - this._animValFrom) * eased);
            if (t >= 1) {
                this.slider.progress = this._animTo;
                this.progressVal = this._animValTo;
                this._isAnimating = false;
            }
        }

        this.updateProgress(this.slider.progress);
    }

    protected onDestroy(): void {
        this._isAnimating = false;
    }

}
