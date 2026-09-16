import { _decorator, Canvas, Component, Layout, Node, UITransform, Vec3, view, warn, Widget } from 'cc';

const { ccclass, property, menu, requireComponent } = _decorator;

/**
 * 将纯背景等比缩放并居中，覆盖目标 UI 矩形；超出的部分允许裁切。
 * 本组件管理节点的位置和缩放，同节点不要使用 Widget、Layout 排版或缩放动画。
 * 裁切由屏幕边界或目标容器的 Mask 负责，本组件不会创建 Mask。
 */
@ccclass
@menu('GameFramework/UIBGAdapter')
@requireComponent(UITransform)
export default class UIBGAdapter extends Component {
    @property({ type: UITransform, tooltip: '需要铺满的 UI 容器；留空时使用最近的父级 Canvas。运行时修改后需重新启用组件。' })
    public target: UITransform | null = null;

    private background: UITransform | null = null;
    private adapterTarget: UITransform | null = null;
    private pending = false;
    private lastWarning = '';

    protected onEnable(): void {
        this.background = this.getComponent(UITransform);
        this.adapterTarget = this.target;
        if (!this.adapterTarget) {
            for (let parent = this.node.parent; parent; parent = parent.parent) {
                if (parent.getComponent(Canvas)) {
                    this.adapterTarget = parent.getComponent(UITransform);
                    break;
                }
            }
        }

        view.on('canvas-resize', this.requestRefresh, this);
        this.node.on(Node.EventType.SIZE_CHANGED, this.requestRefresh, this);
        this.node.on(Node.EventType.ANCHOR_CHANGED, this.requestRefresh, this);
        this.adapterTarget?.node.on(Node.EventType.SIZE_CHANGED, this.requestRefresh, this);
        this.adapterTarget?.node.on(Node.EventType.ANCHOR_CHANGED, this.requestRefresh, this);
        // 等待 Canvas/Widget 更新布局，合并连续的尺寸变化通知。
        this.requestRefresh();
    }

    protected onDisable(): void {
        view.off('canvas-resize', this.requestRefresh, this);
        this.node.off(Node.EventType.SIZE_CHANGED, this.requestRefresh, this);
        this.node.off(Node.EventType.ANCHOR_CHANGED, this.requestRefresh, this);
        if (this.adapterTarget?.isValid) {
            this.adapterTarget.node.off(Node.EventType.SIZE_CHANGED, this.requestRefresh, this);
            this.adapterTarget.node.off(Node.EventType.ANCHOR_CHANGED, this.requestRefresh, this);
        }
        this.unschedule(this.refresh);
        this.pending = false;
        this.adapterTarget = null;
        this.lastWarning = '';
    }

    private requestRefresh(): void {
        if (this.pending) return;
        this.pending = true;
        this.scheduleOnce(this.refresh);
    }

    /** 父级布局或缩放被业务代码修改后，可主动调用；支持 UI 平面内的缩放与旋转。 */
    public refresh(): void {
        this.unschedule(this.refresh);
        this.pending = false;
        if (!this.enabledInHierarchy) return;
        const background = this.background;
        const target = this.adapterTarget;
        if (!background?.isValid || !target?.isValid) {
            this.reportWarning('缺少 UITransform 或父级 Canvas，请指定适配目标。');
            return;
        }
        for (let parent: Node | null = target.node; parent; parent = parent.parent) {
            if (parent === this.node) {
                this.reportWarning('适配目标不能是背景自身或其子节点。');
                return;
            }
        }
        if (this.getComponent(Widget)?.enabled) {
            this.reportWarning('请禁用背景节点上的 Widget，由 UIBG 统一管理位置和缩放。');
            return;
        }
        const layout = this.node.parent?.getComponent(Layout);
        if (layout?.enabled && layout.type !== Layout.Type.NONE) {
            this.reportWarning('请将背景移出 Layout 自动排版容器，避免布局覆盖背景位置。');
            return;
        }
        if (![background.width, background.height, target.width, target.height].every(value => Number.isFinite(value) && value > 0)) {
            this.reportWarning('背景和目标的宽高必须是大于零的有效数值。');
            return;
        }
        const worldScale = this.node.worldScale;
        if (Math.abs(worldScale.x) < 0.000001 || Math.abs(worldScale.y) < 0.000001 || Math.abs(worldScale.z) < 0.000001) {
            this.reportWarning('背景或父级缩放为零，无法适配；恢复缩放后请调用 refresh()。');
            return;
        }

        // 将目标四角转换到背景坐标系，包含全部父级变换，不混用窗口像素与 UI 单位。
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const x of [0, 1]) {
            for (const y of [0, 1]) {
                const corner = new Vec3((x - target.anchorX) * target.width, (y - target.anchorY) * target.height);
                target.convertToWorldSpaceAR(corner, corner);
                background.convertToNodeSpaceAR(corner, corner);
                minX = Math.min(minX, corner.x);
                maxX = Math.max(maxX, corner.x);
                minY = Math.min(minY, corner.y);
                maxY = Math.max(maxY, corner.y);
            }
        }
        const { x, y, z } = this.node.scale;
        const scale = Math.max(Math.abs(x) * (maxX - minX) / background.width, Math.abs(y) * (maxY - minY) / background.height);
        if (!Number.isFinite(scale) || scale <= 0) {
            this.reportWarning('计算出的缩放无效，请检查背景和目标的变换。');
            return;
        }
        // X/Y 使用相同缩放幅度，保留镜像方向和 Z；连续刷新不会累乘放大。
        this.node.setScale(Math.sign(x) * scale, Math.sign(y) * scale, z);
        const targetCenter = target.convertToWorldSpaceAR(new Vec3((0.5 - target.anchorX) * target.width, (0.5 - target.anchorY) * target.height));
        const backgroundCenter = background.convertToWorldSpaceAR(new Vec3((0.5 - background.anchorX) * background.width, (0.5 - background.anchorY) * background.height));
        const position = this.node.worldPosition.clone();
        position.x += targetCenter.x - backgroundCenter.x;
        position.y += targetCenter.y - backgroundCenter.y;
        this.node.setWorldPosition(position);
        this.lastWarning = '';
    }

    private reportWarning(message: string): void {
        if (this.lastWarning === message) return;
        this.lastWarning = message;
        warn('[UIBG] ' + this.node.name + '：' + message);
    }
}
