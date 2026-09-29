import { _decorator, AudioClip, Button, Component, EventTouch, Node, game } from "cc";
import { Logger } from "../../log/Logger";
import { UIButton } from "./UIButton";

const { ccclass, property } = _decorator;

/** 点击音效播放器，由 AudioService 初始化时注入；未注入（音频服务未初始化）时静默跳过。 */
type ClickSoundPlayer = (clip: AudioClip | null) => void;

/**
 * 点击音效组件：挂在任意带 Button / Toggle 的节点上，点击时播放音频配置里的点击音效。
 *
 * 只监听节点已有的点击事件来播放音效，不接管点击逻辑、不翻转任何状态，所以可以和原生 Toggle、
 * Button、UIButton 共存：
 * - 挂原生 Toggle 节点：Toggle 自己处理选中状态与节点显隐，本组件只负责出声；
 * - 音频配置与 UIButton 完全一致：自定义 clickAudio，留空则播放项目默认点击音效。
 *
 * 注意：不要挂在已经带 UIButton 的节点上（UIButton 自己会出声，会重复播放，onLoad 会告警）。
 */
@ccclass("UIClickSound")
export class UIClickSound extends Component {
    private static clickSoundPlayer: ClickSoundPlayer | null = null;

    @property({ type: AudioClip, tooltip: "自定义点击音效；不设置时播放项目默认点击音效（AppConfig.audio.defaultClickSound）" })
    public clickAudio: AudioClip | null = null;

    @property({
        tooltip: "两次有效点击的最小间隔（毫秒）；0 表示不限制。间隔内的点击会被整体拦截：音效与 Toggle 状态都不会变化",
        min: 0,
    })
    public clickInterval: number = 0;

    private lastClickTime: number = Number.NEGATIVE_INFINITY;

    /** 注入点击音效播放器（由 AudioService 调用）。 */
    public static setClickSoundPlayer(player: ClickSoundPlayer | null): void {
        UIClickSound.clickSoundPlayer = player;
    }

    protected onLoad(): void {
        if (this.node.getComponent(UIButton)) {
            Logger.warn(`[UIClickSound] 节点 ${this.node.name} 上已有 UIButton，点击音效会重复播放，请二选一`);
        } else if (!this.node.getComponent(Button)) {
            Logger.warn(`[UIClickSound] 节点 ${this.node.name} 上没有 Button / Toggle，收不到点击事件（CLICK 不冒泡，需与 Button / Toggle 挂同一节点）`);
        }
    }

    protected onEnable(): void {
        this.node.on(Button.EventType.CLICK, this.onClick, this);
        // 防连点必须用捕获阶段：同节点的 Button / Toggle 都在冒泡阶段处理 TOUCH_END，
        // 只有在这里置 propagationImmediateStopped，才能让本次点击不再发出 CLICK，从而把状态一起拦下。
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEndedCapture, this, true);
    }

    protected onDisable(): void {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEndedCapture, this, true);
    }

    /** 点击回调：记录时间并播放音效（走到这里说明本次点击通过了防连点判定）。 */
    private onClick(): void {
        this.lastClickTime = game.totalTime;
        UIClickSound.clickSoundPlayer?.(this.clickAudio);
    }

    /** 捕获阶段拦截防连点窗口内的点击。 */
    private onTouchEndedCapture(event: EventTouch): void {
        if (this.clickInterval <= 0 || game.totalTime - this.lastClickTime >= this.clickInterval) {
            return;
        }

        // 3.8 起 Event.stopPropagationImmediate() 被注释掉了，只能直接改字段
        event.propagationImmediateStopped = true;
    }
}
