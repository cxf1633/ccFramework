import {
    _decorator, Canvas, Component, EventTouch, Game, game, Input, input, instantiate,
    isValid, Node, Prefab, Quat, Sprite, SpriteFrame, UITransform, Vec2, Vec3,
} from 'cc';
import { UIDropTarget } from './UIDropTarget';
import type { UIDragContext, UIDragEndContext, UIDropContext } from './UIDragTypes';

const { ccclass, property, requireComponent, disallowMultiple, menu } = _decorator;

interface SourcePose {
    parent: Node;
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    siblingIndex: number;
}

interface DragSession {
    node: Node;
    pose: SourcePose | null;
    target: UIDropTarget | null;
    screen: Vec2;
    ui: Vec2;
    touchId: number;
    windowId: number;
    started: boolean;
}

/** 统一处理输入、移动、副本、目标切换和复位；物品规则留给业务组件。 */
@ccclass('UIDragSource')
@requireComponent(UITransform)
@disallowMultiple
@menu('UI/UIDragSource')
export class UIDragSource extends Component {
    public static readonly EventType = {
        /** 达到起拖条件并成功创建拖动物体后触发；未起拖的轻点不触发。 */
        DRAG_START: 'ui-drag-source-start',
        /** 拖动位置和当前目标检测更新后触发，参数为 UIDragContext。 */
        DRAG_MOVE: 'ui-drag-source-move',
        /** 进入可接收的目标区域时触发，上下文中包含当前目标。 */
        TARGET_ENTER: 'ui-drag-source-target-enter',
        /** 离开、切换目标或结束当前目标交互时触发。 */
        TARGET_LEAVE: 'ui-drag-source-target-leave',
        /** 已开始的拖动结束时触发，包括取消；参数包含 cancelled 和 dropped。 */
        DRAG_END: 'ui-drag-source-end',
        /** 已开始的拖动被取消或中断时触发，随后仍会触发 DRAG_END。 */
        DRAG_CANCEL: 'ui-drag-source-cancel',
        /** 自身拖动复位后触发，参数为当前 UIDragSource；销毁副本不触发。 */
        SOURCE_RESTORED: 'ui-drag-source-restored',
    } as const;

    @property({ tooltip: '拖动时创建新实例；关闭时拖动当前节点，开启时优先使用 Drag Prefab，其次使用图片' })
    public InstanceOnDrop = false;
    @property({ tooltip: '仅用于副本：命中后销毁副本；关闭由业务接管。未命中和取消始终销毁副本' })
    public destroyOnDrop = true;

    @property({ type: Prefab, tooltip: '开启 Create Instance 时优先生成此 UI 预制体；留空使用图片副本' })
    public dragPrefab: Prefab | null = null;

    @property({ type: SpriteFrame, tooltip: '创建图片副本时使用此图片；留空使用当前节点 Sprite 的 SpriteFrame' })
    public dragSpriteFrame: SpriteFrame | null = null;

    @property({ type: SpriteFrame, tooltip: '悬停在可接收目标时显示的预览图片；留空不显示预览' })
    public previewSpriteFrame: SpriteFrame | null = null;

    @property({ type: Node, tooltip: '仅用于副本：指定带 UITransform 的父节点；留空使用最近的 Canvas' })
    public dragParent: Node | null = null;

    @property({ type: [UIDropTarget], tooltip: '按数组顺序检测指定目标；留空自动发现当前场景的活动目标' })
    public dropTargets: UIDropTarget[] = [];

    @property({ type: Node, tooltip: '限制目标所属子树，例如 PrepShelf/Slots；留空不限制' })
    public targetRoot: Node | null = null;

    @property({ min: 0, tooltip: '超过此 UI 距离开始拖动；0 表示按下即拖动' })
    public dragThreshold = 8;

    @property({ tooltip: '相对手指的 UI 偏移；自身拖动同时保留抓取偏移' })
    public pointerOffset = new Vec2();



    private touchId: number | null = null;
    private readonly startPoint = new Vec2();
    private readonly grabOffset = new Vec2();
    private session: DragSession | null = null;
    private pausedTouchNode: Node | null = null;

    /** 可选起拖条件；未设置时默认允许。业务组件停用时应清除自身回调。 */
    public canStartDrag: (() => boolean) | null = null;

    public get isDragging(): boolean { return !!this.session?.started; }

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
        game.on(Game.EVENT_HIDE, this.cancelDrag, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
        game.off(Game.EVENT_HIDE, this.cancelDrag, this);
        this.cancelDrag();
    }

    protected onDestroy(): void { this.cancelDrag(); }

    protected lateUpdate(): void {
        const session = this.session;
        if (session && (!isValid(session.node, true) || !session.node.activeInHierarchy)) this.cancelDrag();
    }

    public cancelDrag(): void {
        const session = this.session;
        this.session = null;
        this.releaseTouch();
        if (!session) return;
        const context = this.context(session);
        try { this.leaveTarget(session); }
        finally {
            try { this.restoreOrDestroy(session); }
            finally { if (session.started) this.emitFinished(context, true, false); }
        }
    }

    /** 目标禁用时立即解除悬停，无需等待下一次手指移动。 */
    public clearTarget(target: UIDropTarget): void {
        if (this.session?.target === target) this.leaveTarget(this.session);
    }

    private onTouchStart(event: EventTouch): void {
        if (!this.enabledInHierarchy || this.touchId !== null || this.canStartDrag?.() === false) return;
        const touchId = event.getID();
        if (touchId === null) return;
        this.touchId = touchId;
        this.startPoint.set(event.getUILocation());
        const world = this.node.worldPosition;
        this.grabOffset.set(world.x - this.startPoint.x, world.y - this.startPoint.y);
        event.propagationStopped = true;
        this.captureTouch(event);
        if (this.dragThreshold <= 0) this.createDrag(event);
    }

    private captureTouch(event: EventTouch): void {
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchFinished, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchFinished, this);
        // 仅暂停实际起触节点（可能是子节点），不改变其他子节点原有的暂停状态。
        // 它不再认领后续节点事件，使原始输入保留 END/CANCEL 类型，不被 UI 派发改写。
        this.pausedTouchNode = event.target instanceof Node ? event.target : this.node;
        this.pausedTouchNode.pauseSystemEvents(false);
    }

    private releaseTouch(): void {
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchFinished, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchFinished, this);
        const node = this.pausedTouchNode;
        this.pausedTouchNode = null;
        this.touchId = null;
        if (node && isValid(node, true)) node.resumeSystemEvents(false);
    }

    private onTouchMove(event: EventTouch): void {
        if (this.touchId !== event.getID()) return;
        event.propagationStopped = true;
        if (this.session) this.moveDrag(event);
        else if (Vec2.distance(this.startPoint, event.getUILocation()) >= this.dragThreshold) this.createDrag(event);
    }

    private onTouchFinished(event: EventTouch): void {
        if (this.touchId !== event.getID()) return;
        if (event.type === Input.EventType.TOUCH_END) this.onTouchEnd(event);
        else if (event.type === Input.EventType.TOUCH_CANCEL) {
            event.propagationStopped = true;
            this.cancelDrag();
        }
    }

    private createDrag(event: EventTouch): void {
        const touchId = this.touchId;
        if (touchId === null) return;
        // 按下到越过起拖阈值之间，业务状态也可能发生变化。
        if (this.canStartDrag?.() === false) { this.cancelDrag(); return; }
        const self = !this.InstanceOnDrop;
        const frame = this.dragSpriteFrame ?? this.getComponent(Sprite)?.spriteFrame ?? null;
        const parent = self ? this.node.parent : this.dragParent ?? this.findCanvasNode();
        if (!parent || !isValid(parent, true) || !parent.activeInHierarchy || !parent.getComponent(UITransform)
            || (!self && (this.dragPrefab ? !isValid(this.dragPrefab, true) : !frame || !isValid(frame, true)))) {
            console.warn('[UIDragSource] 请配置有效的 UI 父节点；创建实例需要预制体或 SpriteFrame。');
            this.cancelDrag();
            return;
        }
        const node = self ? this.node : this.dragPrefab ? instantiate(this.dragPrefab) : this.createImageNode(frame!);
        if (!node.getComponent(UITransform)) {
            console.warn('[UIDragSource] 拖动节点需要 UITransform。');
            if (!self) node.destroy();
            this.cancelDrag();
            return;
        }
        const pose: SourcePose | null = self ? {
            parent, position: node.position.clone(), rotation: node.rotation.clone(),
            scale: node.scale.clone(), siblingIndex: node.getSiblingIndex(),
        } : null;
        const session: DragSession = {
            node, pose, target: null, screen: event.getLocation().clone(), ui: event.getUILocation().clone(),
            touchId, windowId: event.windowId, started: false,
        };
        this.session = session;
        if (!self) { node.setParent(parent); node.active = true; }
        // 副本 onLoad/onEnable 可能中止来源；自身保留父节点以维持触摸派发路径。
        if (this.session !== session || !this.enabledInHierarchy || !isValid(node, true)) {
            if (!self && isValid(node, true)) node.destroy();
            if (this.session === session) this.cancelDrag();
            return;
        }
        node.setSiblingIndex(parent.children.length - 1);
        session.started = true;
        try {
            this.node.emit(UIDragSource.EventType.DRAG_START, this.context(session));
            if (this.session === session) this.moveDrag(event);
        } catch (error) {
            if (this.session === session) this.cancelDrag();
            throw error;
        }
    }

    private findCanvasNode(): Node | null {
        for (let node: Node | null = this.node; node; node = node.parent) if (node.getComponent(Canvas)) return node;
        return null;
    }

    private createImageNode(frame: SpriteFrame): Node {
        const node = new Node('DraggedImage');
        node.layer = this.node.layer;
        node.addComponent(UITransform);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.TRIMMED;
        sprite.spriteFrame = frame;
        return node;
    }

    private moveDrag(event: EventTouch): void {
        const session = this.session;
        const node = session?.node;
        const parent = node?.parent;
        const transform = parent?.getComponent(UITransform);
        if (!session || !node || !isValid(node, true) || !node.activeInHierarchy
            || !parent || !isValid(parent, true) || !transform) {
            this.cancelDrag();
            return;
        }
        session.screen.set(event.getLocation());
        session.ui.set(event.getUILocation());
        session.windowId = event.windowId;
        const grab = session.pose ? this.grabOffset : Vec2.ZERO;
        const local = transform.convertToNodeSpaceAR(new Vec3(
            session.ui.x + this.pointerOffset.x + grab.x, session.ui.y + this.pointerOffset.y + grab.y, 0,
        ));
        node.setPosition(local.x, local.y, node.position.z);
        try {
            const target = this.findTarget(this.context(session));
            if (session.target !== target) {
                this.leaveTarget(session);
                if (this.session !== session) return;
                session.target = target;
                if (target) {
                    const context = this.context(session, target) as UIDropContext;
                    target.enter(context);
                    if (this.session === session && session.target === target) {
                        this.node.emit(UIDragSource.EventType.TARGET_ENTER, context);
                    }
                }
            }
            if (this.session !== session) return;
            const context = this.context(session);
            session.target?.over(context as UIDropContext);
            if (this.session === session) this.node.emit(UIDragSource.EventType.DRAG_MOVE, this.context(session));
        } catch (error) {
            if (this.session === session) this.cancelDrag();
            throw error;
        }
    }

    private findTarget(context: UIDragContext): UIDropTarget | null {
        const targets = this.dropTargets.length ? this.dropTargets : UIDropTarget.getActiveTargets();
        for (const target of targets) {
            if (!target || !isValid(target, true) || target.node === this.node || target.node.scene !== this.node.scene) continue;
            if (this.targetRoot) {
                let ancestor: Node | null = target.node;
                while (ancestor && ancestor !== this.targetRoot) ancestor = ancestor.parent;
                if (!ancestor) continue;
            }
            if (target.containsPoint(context.screenPosition, context.windowId) && target.canAccept(context)) return target;
        }
        return null;
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.touchId !== event.getID()) return;
        event.propagationStopped = true;
        if (!this.session) { this.releaseTouch(); return; }
        this.moveDrag(event);
        const session = this.session;
        if (!session) return;
        const context = this.context(session);
        this.session = null;
        this.releaseTouch();
        let dropped = false;
        try {
            if (session.target) dropped = session.target.drop(context as UIDropContext);
        } finally {
            try { this.leaveTarget(session); }
            finally {
                try {
                    if (!dropped) this.restoreOrDestroy(session);
                    else if (!session.pose && this.destroyOnDrop && isValid(session.node, true)) session.node.destroy();
                } finally { this.emitFinished(context, false, dropped); }
            }
        }
    }

    private leaveTarget(session: DragSession): void {
        const target = session.target;
        session.target = null;
        if (!target || !isValid(target, true)) return;
        const context = this.context(session, target) as UIDropContext;
        try { target.leave(context); }
        finally {
            if (isValid(this.node, true)) this.node.emit(UIDragSource.EventType.TARGET_LEAVE, context);
        }
    }

    private context(session: DragSession, target = session.target): UIDragContext {
        return {
            source: this, sourceNode: this.node, dragNode: session.node, target, targetNode: target?.node ?? null,
            screenPosition: session.screen.clone(), uiPosition: session.ui.clone(),
            touchId: session.touchId, windowId: session.windowId,
            restoreSource: () => { if (session.pose) this.restorePose(session.pose); },
        };
    }

    private emitFinished(context: UIDragContext, cancelled: boolean, dropped: boolean): void {
        if (!isValid(this.node, true)) return;
        const end: UIDragEndContext = { ...context, cancelled, dropped };
        try {
            if (cancelled) this.node.emit(UIDragSource.EventType.DRAG_CANCEL, end);
        } finally { this.node.emit(UIDragSource.EventType.DRAG_END, end); }
    }

    private restoreOrDestroy(session: DragSession): void {
        if (session.pose) this.restorePose(session.pose);
        else if (isValid(session.node, true)) session.node.destroy();
    }

    private restorePose(pose: SourcePose): void {
        if (!isValid(this.node, true) || !isValid(pose.parent, true)) return;
        if (this.node.parent !== pose.parent) this.node.setParent(pose.parent);
        this.node.setPosition(pose.position);
        this.node.setRotation(pose.rotation);
        this.node.setScale(pose.scale);
        this.node.setSiblingIndex(pose.siblingIndex);
        this.node.emit(UIDragSource.EventType.SOURCE_RESTORED, this);
    }
}
