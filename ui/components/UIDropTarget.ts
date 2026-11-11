import { _decorator, Color, Component, EventHandler, isValid, Node, Sprite, UITransform, Vec2 } from 'cc';
import type { UIDragContext, UIDropContext } from './UIDragTypes';

const { ccclass, property, requireComponent, disallowMultiple, menu } = _decorator;

/** 接收端提供范围、接收规则和通知，不监听触摸或移动来源。 */
@ccclass('UIDropTarget')
@requireComponent(UITransform)
@disallowMultiple
@menu('UI/UIDropTarget')
export class UIDropTarget extends Component {
    public static readonly EventType = {
        ENTER: 'ui-drop-target-enter',
        OVER: 'ui-drop-target-over',
        LEAVE: 'ui-drop-target-leave',
        DROP: 'ui-drop-target-drop',
    } as const;

    private static readonly targets = new Set<UIDropTarget>();

    @property({ type: Node, tooltip: '检测范围；留空使用自身 UITransform，不合并子节点范围' })
    public hitArea: Node | null = null;

    @property({ type: [Node], tooltip: '允许接收的来源节点；空列表仅使用业务接收条件' })
    public acceptedSources: Node[] = [];

    @property({ tooltip: '自动发现目标时，优先级越大越先检测；同优先级按注册顺序' })
    public priority = 0;

    @property({ type: [EventHandler], tooltip: '可选的放下回调，参数为 UIDropContext 和非空的 CustomEventData' })
    public dropEvents: EventHandler[] = [];

    /** 可选业务接收条件；禁用/销毁时应按原引用清除。 */
    public accepts: ((context: UIDragContext) => boolean) | null = null;

    private previewNode: Node | null = null;

    public get isPreviewing(): boolean { return !!this.previewNode; }

    private hoverContext: UIDropContext | null = null;

    public static getActiveTargets(): UIDropTarget[] {
        return Array.from(this.targets).sort((a, b) => b.priority - a.priority);
    }

    protected onEnable(): void { UIDropTarget.targets.add(this); }

    protected onDisable(): void {
        UIDropTarget.targets.delete(this);
        this.clearPreview();
        const context = this.hoverContext;
        if (context) {
            context.source.clearTarget(this);
            this.leave(context);
        }
    }

    protected onDestroy(): void { this.clearPreview(); UIDropTarget.targets.delete(this); }

    public containsPoint(screenPoint: Vec2, windowId = 0): boolean {
        const area = this.hitArea ?? this.node;
        return this.enabledInHierarchy && isValid(area, true) && area.activeInHierarchy
            && !!area.getComponent(UITransform)?.hitTest(screenPoint, windowId);
    }

    public canAccept(context: UIDragContext): boolean {
        if (!isValid(this, true) || !this.enabledInHierarchy) return false;
        if (this.acceptedSources.length && this.acceptedSources.indexOf(context.sourceNode) < 0) return false;
        // 一个目标同时只由一个来源占用，避免多指预览相互覆盖。
        if (this.hoverContext && this.hoverContext.source !== context.source) return false;
        return this.accepts?.({ ...context, target: this, targetNode: this.node }) ?? true;
    }

    /** 独立预览节点，不改写目标的正式图片或动画状态。 */
    private showPreview(context: UIDropContext): void {
        const frame = context.source.previewSpriteFrame;
        if (!frame || !isValid(frame, true)) {
            this.clearPreview();
            return;
        }
        if (!this.previewNode) {
            this.previewNode = new Node('DropPreview');
            this.previewNode.layer = this.node.layer;
            this.previewNode.addComponent(UITransform);
            const sprite = this.previewNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.TRIMMED;
            sprite.color = new Color(255, 255, 255, 128);
            this.previewNode.setParent(this.node);
        }
        this.previewNode.getComponent(Sprite)!.spriteFrame = frame;
        const area = this.hitArea ?? this.node;
        const position = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(area.worldPosition);
        this.previewNode.setPosition(position);
    }

    public clearPreview(): void {
        const node = this.previewNode;
        this.previewNode = null;
        if (node && isValid(node, true)) {
            node.active = false;
            node.destroy();
        }
    }

    /** 以下通知入口由 UIDragSource 调用。 */
    public enter(context: UIDropContext): void {
        this.hoverContext = context;
        this.showPreview(context);
        this.node.emit(UIDropTarget.EventType.ENTER, context);
    }

    public over(context: UIDropContext): void {
        if (this.hoverContext?.source !== context.source) return;
        this.hoverContext = context;
        this.showPreview(context);
        this.node.emit(UIDropTarget.EventType.OVER, context);
    }

    public leave(context: UIDropContext): void {
        if (this.hoverContext?.source !== context.source) return;
        this.hoverContext = null;
        this.clearPreview();
        this.node.emit(UIDropTarget.EventType.LEAVE, context);
    }

    public drop(context: UIDropContext): boolean {
        if (!this.canAccept(context)) return false;
        this.clearPreview();
        this.node.emit(UIDropTarget.EventType.DROP, context);
        EventHandler.emitEvents(this.dropEvents, context);
        return true;
    }
}
