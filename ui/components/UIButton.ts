import { _decorator, AudioClip, Button, EventTouch, game } from "cc";

const { ccclass, property } = _decorator;

type ClickSoundPlayer = (clip: AudioClip | null) => void;

/** 带点击音效的通用按钮；未指定音效时由音频服务播放默认 UI 点击音效。 */
@ccclass("UIButton")
export class UIButton extends Button {
    private static clickSoundPlayer: ClickSoundPlayer | null = null;

    @property({ type: AudioClip, tooltip: "自定义点击音效；不设置时播放默认 ui_click" })
    public clickAudio: AudioClip | null = null;

    @property({ tooltip: "两次有效点击的最小间隔（毫秒）；0 表示不限制", min: 0 })
    public clickInterval: number = 0;

    private lastClickTime: number = Number.NEGATIVE_INFINITY;

    /** 处理有效点击、防连点和点击音效。 */
    protected _onTouchEnded(event?: EventTouch): void {
        if (!this.interactable || !this.enabledInHierarchy) {
            super._onTouchEnded(event);
            return;
        }

        if (this.clickInterval > 0 && game.totalTime - this.lastClickTime < this.clickInterval) {
            this._resetState();
            if (event) {
                event.propagationStopped = true;
            }
            return;
        }

        super._onTouchEnded(event);
        this.lastClickTime = game.totalTime;
        UIButton.clickSoundPlayer?.(this.clickAudio);
    }

    /** 注入或清除按钮点击音效播放器。 */
    public static setClickSoundPlayer(player: ClickSoundPlayer | null): void {
        UIButton.clickSoundPlayer = player;
    }
}
