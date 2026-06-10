import type { Node } from "cc";

export enum UILayer {
    Game = "LayerGame",
    UI = "LayerUI",
    PopUp = "LayerPopUp",
    Dialog = "LayerDialog",
    Toast = "LayerToast",
    System = "LayerSystem",
    Guide = "LayerGuide",
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
    singleton?: boolean;
    blockInput?: boolean;
}

export interface UIOpenParam {
    data?: any;
    onAdded?: (node: Node, data?: any) => void;
    onBeforeRemove?: (node: Node, next: () => void, data?: any) => void;
    onRemoved?: (node: Node, data?: any) => void;
}

export interface UIOpenOptions extends UIConfig, UIOpenParam {
}

export interface UICloseOptions {
    destroy?: boolean;
}
