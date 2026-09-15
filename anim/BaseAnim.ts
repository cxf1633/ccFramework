import { easing, Enum } from 'cc';
import { Tween } from 'cc';
import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

/** 缓动类型（数值枚举，配合 @property({ type: Enum(EasingType) }) 在 Inspector 显示下拉菜单） */
export enum EasingType {
    Linear = 0,
    Constant,
    SineIn,
    SineOut,
    SineInOut,
    QuadIn,
    QuadOut,
    QuadInOut,
    CubicIn,
    CubicOut,
    CubicInOut,
    QuartIn,
    QuartOut,
    QuartInOut,
    QuintIn,
    QuintOut,
    QuintInOut,
    ExpoIn,
    ExpoOut,
    ExpoInOut,
    CircIn,
    CircOut,
    CircInOut,
    BackIn,
    BackOut,
    BackInOut,
    ElasticIn,
    ElasticOut,
    ElasticInOut,
    BounceIn,
    BounceOut,
    BounceInOut,
}

/** 枚举成员 → cc 缓动函数名字符串（与 getEasingFunction 的映射表一致） */
export const EasingNames: Record<EasingType, string> = {
    [EasingType.Linear]: 'linear',
    [EasingType.Constant]: 'constant',
    [EasingType.SineIn]: 'sineIn',
    [EasingType.SineOut]: 'sineOut',
    [EasingType.SineInOut]: 'sineInOut',
    [EasingType.QuadIn]: 'quadIn',
    [EasingType.QuadOut]: 'quadOut',
    [EasingType.QuadInOut]: 'quadInOut',
    [EasingType.CubicIn]: 'cubicIn',
    [EasingType.CubicOut]: 'cubicOut',
    [EasingType.CubicInOut]: 'cubicInOut',
    [EasingType.QuartIn]: 'quartIn',
    [EasingType.QuartOut]: 'quartOut',
    [EasingType.QuartInOut]: 'quartInOut',
    [EasingType.QuintIn]: 'quintIn',
    [EasingType.QuintOut]: 'quintOut',
    [EasingType.QuintInOut]: 'quintInOut',
    [EasingType.ExpoIn]: 'expoIn',
    [EasingType.ExpoOut]: 'expoOut',
    [EasingType.ExpoInOut]: 'expoInOut',
    [EasingType.CircIn]: 'circIn',
    [EasingType.CircOut]: 'circOut',
    [EasingType.CircInOut]: 'circInOut',
    [EasingType.BackIn]: 'backIn',
    [EasingType.BackOut]: 'backOut',
    [EasingType.BackInOut]: 'backInOut',
    [EasingType.ElasticIn]: 'elasticIn',
    [EasingType.ElasticOut]: 'elasticOut',
    [EasingType.ElasticInOut]: 'elasticInOut',
    [EasingType.BounceIn]: 'bounceIn',
    [EasingType.BounceOut]: 'bounceOut',
    [EasingType.BounceInOut]: 'bounceInOut',
};

/** 动画基类 - 统一管理自动播放、延迟、重播和停止 */
@ccclass('BaseAnim')
export abstract class BaseAnim extends Component {

    @property({ tooltip: '节点启用时自动播放' })
    playOnEnable: boolean = true; // 是否自动播放

    @property({ tooltip: '动画时长（秒）' })
    duration: number = 0.3; // 动画时间

    @property({ tooltip: '播放前的延迟（秒）' })
    delay: number = 0; // 延迟

    @property({ tooltip: '是否循环播放' })
    loop: boolean = false; // 是否循环

    protected _isPlaying: boolean = false;
    protected _tween: Tween<any> | null = null;

    onEnable() {
        if (this.playOnEnable) {
            this.play();
        }
    }

    protected onDisable(): void {
        this.stop();
    }

    play() {

        if (this._isPlaying) return;

        this._isPlaying = true;

        this.scheduleOnce(() => {
            this.onPlay();
        }, this.delay);
    }

    replay() {
        this.stop();
        this.play();
    }

    stop() {
        this._isPlaying = false;
        this.unscheduleAllCallbacks();
        this.onStop();
    }

    protected abstract onPlay(): void;
    protected abstract onStop(): void;

    // 字符串到缓动函数的映射，未知名字默认回退 sineOut
    protected getEasingFunction(easingName: string): ((k: number) => number) {
        const easingMap: Record<string, ((k: number) => number)> = {
            // 基础缓动
            'linear': easing.linear,
            'constant': easing.constant,

            // Sine 缓动
            'sineIn': easing.sineIn,
            'sineOut': easing.sineOut,
            'sineInOut': easing.sineInOut,

            // Quad 缓动
            'quadIn': easing.quadIn,
            'quadOut': easing.quadOut,
            'quadInOut': easing.quadInOut,

            // Cubic 缓动
            'cubicIn': easing.cubicIn,
            'cubicOut': easing.cubicOut,
            'cubicInOut': easing.cubicInOut,

            // Quart 缓动
            'quartIn': easing.quartIn,
            'quartOut': easing.quartOut,
            'quartInOut': easing.quartInOut,

            // Quint 缓动
            'quintIn': easing.quintIn,
            'quintOut': easing.quintOut,
            'quintInOut': easing.quintInOut,

            // Expo 缓动
            'expoIn': easing.expoIn,
            'expoOut': easing.expoOut,
            'expoInOut': easing.expoInOut,

            // Circ 缓动
            'circIn': easing.circIn,
            'circOut': easing.circOut,
            'circInOut': easing.circInOut,

            // Back 缓动
            'backIn': easing.backIn,
            'backOut': easing.backOut,
            'backInOut': easing.backInOut,

            // Elastic 缓动
            'elasticIn': easing.elasticIn,
            'elasticOut': easing.elasticOut,
            'elasticInOut': easing.elasticInOut,

            // Bounce 缓动
            'bounceIn': easing.bounceIn,
            'bounceOut': easing.bounceOut,
            'bounceInOut': easing.bounceInOut,
        };

        return easingMap[easingName] || easing.sineOut;
    }

}
