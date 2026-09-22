import { _decorator, Component, easing, Enum, Label, Tween, tween } from 'cc';
import { EasingNames, EasingType } from '../../anim/BaseAnim';

const { ccclass, property } = _decorator;

export type NumberFormatter = (value: number) => string;

export interface NumberRollOptions {
    /** 本次滚动时长；不传时使用 Inspector 配置。 */
    duration?: number;
    /** 本次缓动类型；不传时使用 Inspector 配置。 */
    easing?: EasingType;
    /** 自然播放完成后的回调；被新动画替换或主动停止时不调用。 */
    onComplete?: () => void;
}

interface NumberTweenTarget {
    value: number;
}

/**
 * 通用数值滚动组件。
 *
 * 组件内部维护真实数值，不会反向解析 Label 文本。连续设置新值时，
 * 会从当前动画进度继续滚向新目标，适用于金币、积分、经验等数字展示。
 */
@ccclass('NumberRoller')
export class NumberRoller extends Component {
    @property({ type: Label, tooltip: '显示数值的 Label；留空时使用当前节点上的 Label' })
    private label: Label = null;

    @property({ tooltip: '初始数值' })
    private initialValue: number = 0;

    @property({ tooltip: '默认滚动时长（秒）' })
    private duration: number = 0.35;

    @property({ type: Enum(EasingType), tooltip: '默认缓动类型' })
    private easingType: EasingType = EasingType.QuadOut;

    @property({ tooltip: '未设置自定义格式化函数时保留的小数位数' })
    private decimalPlaces: number = 0;

    private currentValue: number = 0;
    private targetValue: number = 0;
    private readonly tweenTarget: NumberTweenTarget = { value: 0 };
    private activeTween: Tween<NumberTweenTarget> | null = null;
    private formatter: NumberFormatter | null = null;
    private lastText: string | null = null;
    private playVersion: number = 0;
    private initialized: boolean = false;

    protected onLoad(): void {
        this.initialize();
    }

    private initialize(): void {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.currentValue = this.normalizeValue(this.initialValue);
        this.targetValue = this.currentValue;
        this.tweenTarget.value = this.currentValue;
        this.renderValue(this.currentValue);
    }

    protected onDisable(): void {
        // 隐藏期间不保留半完成状态，下次显示时直接呈现最后目标值。
        if (this.initialized) {
            this.stop(true);
        }
    }

    protected onDestroy(): void {
        this.stopTween();
        this.formatter = null;
        this.label = null;
        this.initialized = false;
    }

    /** 当前动画实际走到的数值。 */
    public get value(): number {
        return this.initialized ? this.currentValue : this.normalizeValue(this.initialValue);
    }

    /** 当前滚动的目标值。 */
    public get target(): number {
        return this.initialized ? this.targetValue : this.normalizeValue(this.initialValue);
    }

    /**
     * 滚动到目标值。连续调用会停止旧动画，并从当前动画值继续播放。
     */
    public setValue(value: number, options: NumberRollOptions = {}): void {
        this.initialize();
        const normalizedValue = this.normalizeValue(value);
        const requestedDuration = options.duration ?? this.duration;
        const rollDuration = Number.isFinite(requestedDuration)
            ? Math.max(0, requestedDuration)
            : 0;

        this.stopTween();
        this.targetValue = normalizedValue;

        if (
            !this.enabledInHierarchy
            || !this.node?.activeInHierarchy
            || rollDuration <= 0
            || this.currentValue === normalizedValue
        ) {
            this.applyValue(normalizedValue);
            options.onComplete?.();
            return;
        }

        const version = this.playVersion;
        this.tweenTarget.value = this.currentValue;
        const easingFunction = this.resolveEasing(options.easing ?? this.easingType);

        this.activeTween = tween(this.tweenTarget)
            .to(rollDuration, { value: normalizedValue }, {
                easing: easingFunction,
                onUpdate: () => {
                    if (version !== this.playVersion) {
                        return;
                    }
                    this.currentValue = this.tweenTarget.value;
                    this.renderValue(this.currentValue);
                },
            })
            .call(() => {
                if (version !== this.playVersion) {
                    return;
                }
                this.activeTween = null;
                this.applyValue(normalizedValue);
                options.onComplete?.();
            })
            .start();
    }

    /** 立即设置数值，不播放动画。 */
    public setImmediate(value: number): void {
        this.initialize();
        this.stopTween();
        this.targetValue = this.normalizeValue(value);
        this.applyValue(this.targetValue);
    }

    /**
     * 停止当前动画。
     * complete=true 时直接显示目标值；无论是否完成，都不会触发原动画回调。
     */
    public stop(complete: boolean = false): void {
        this.initialize();
        const finalValue = complete ? this.targetValue : this.currentValue;
        this.stopTween();
        this.targetValue = finalValue;
        this.applyValue(finalValue);
    }

    /** 设置业务格式化函数；传 null 恢复组件默认数字格式。 */
    public setFormatter(formatter: NumberFormatter | null): void {
        this.initialize();
        this.formatter = formatter;
        this.lastText = null;
        this.renderValue(this.currentValue);
    }

    /** 运行时替换显示 Label；传 null 时重新尝试使用当前节点上的 Label。 */
    public setLabel(label: Label | null): void {
        this.label = label;
        this.lastText = null;
        this.initialize();
        this.renderValue(this.currentValue);
    }

    private stopTween(): void {
        this.playVersion++;
        this.activeTween?.stop();
        this.activeTween = null;
        Tween.stopAllByTarget(this.tweenTarget);
    }

    private applyValue(value: number): void {
        this.currentValue = value;
        this.tweenTarget.value = value;
        this.renderValue(value);
    }

    private renderValue(value: number): void {
        const label = this.resolveLabel();
        if (!label) {
            return;
        }

        const text = this.formatter
            ? this.formatter(value)
            : this.formatDefault(value);
        if (text === this.lastText) {
            return;
        }

        this.lastText = text;
        label.string = text;
    }

    private resolveLabel(): Label | null {
        if (!this.label?.isValid) {
            this.label = this.getComponent(Label);
        }
        return this.label?.isValid ? this.label : null;
    }

    private formatDefault(value: number): string {
        const decimalPlaces = Math.min(10, Math.max(0, Math.floor(this.decimalPlaces)));
        const factor = 10 ** decimalPlaces;
        const roundedValue = Math.round(value * factor) / factor;
        const normalizedValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
        return decimalPlaces > 0
            ? normalizedValue.toFixed(decimalPlaces)
            : String(normalizedValue);
    }

    private normalizeValue(value: number): number {
        return Number.isFinite(value) ? value : 0;
    }

    private resolveEasing(easingType: EasingType): (progress: number) => number {
        const easingFunctions = easing as unknown as Record<string, (progress: number) => number>;
        return easingFunctions[EasingNames[easingType]] || easing.quadOut;
    }
}
