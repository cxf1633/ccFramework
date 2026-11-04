import type { Node, Vec2 } from 'cc';
import type { UIDragSource } from './UIDragSource';
import type { UIDropTarget } from './UIDropTarget';

/** 位置检测使用屏幕坐标，移动显示使用 UI 坐标。 */
export interface UIDragContext {
    source: UIDragSource;
    sourceNode: Node;
    dragNode: Node;
    target: UIDropTarget | null;
    targetNode: Node | null;
    screenPosition: Vec2;
    uiPosition: Vec2;
    touchId: number;
    windowId: number;
    /** 自身拖动恢复起拖前的父节点和变换；副本模式不移动来源。 */
    restoreSource: () => void;
}

export interface UIDropContext extends UIDragContext {
    target: UIDropTarget;
    targetNode: Node;
}

/** 正常松手和取消都会触发一次 DRAG_END，轻点未起拖时不触发。 */
export interface UIDragEndContext extends UIDragContext {
    cancelled: boolean;
    dropped: boolean;
}
