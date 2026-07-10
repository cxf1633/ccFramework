export enum UILayer {
    Game = "LayerGame",       // 游戏内固定 UI
    UI = "LayerUI",           // 普通全屏界面
    PopUp = "LayerPopUp",     // 普通非强模态弹窗。比如道具详情、活动小窗、奖励详情、个人信息小弹层。
    Dialog = "LayerDialog",   // 强交互弹窗。比如 MessageBox、ConfirmDialog、退出确认、支付确认、维护提示。
    Toast = "LayerToast",     // 轻提示。比如“金币不足”“网络不稳定”“复制成功”。不应该放按钮，不应该阻塞操作，通常自动消失。
    System = "LayerSystem",   // 系统级阻塞层。比如网络等待遮罩、全屏 loading、热更新进度、重连遮罩。它应该盖过普通 UI/弹窗/toast，防止重复点击或状态错乱。
    Guide = "LayerGuide",     // 最高层。比如新手引导遮罩、手指提示、强制点击区域、高亮框。
}

export const UI_LAYER_ORDER: readonly UILayer[] = [
    UILayer.Game,
    UILayer.UI,
    UILayer.PopUp,
    UILayer.Dialog,
    UILayer.Toast,
    UILayer.System,
    UILayer.Guide,
];

export interface UIConfig {
    bundle?: string;
    prefab?: string;
    layer?: UILayer;
    destroy?: boolean;
}

export interface UIOpenOptions extends UIConfig {
    params?: any;
}

export interface UICloseOptions {
    destroy?: boolean;
}
