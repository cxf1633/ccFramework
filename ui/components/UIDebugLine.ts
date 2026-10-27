import { _decorator, Color, Component, Graphics, Node, UITransform, Vec2, Vec3 } from "cc";
import { EDITOR } from "cc/env";

const { ccclass, property, requireComponent, disallowMultiple, executeInEditMode, menu } = _decorator;

/** 通用 2D 调试线。独占同节点的 Graphics，不负责区域命中或随机落点计算。 */
@ccclass("UIDebugLine")
@menu("UI/UIDebugLine")
@requireComponent(Graphics)
@disallowMultiple
@executeInEditMode(true)
export class UIDebugLine extends Component {
    @property({ type: [Vec2], tooltip: "按顺序连线的点，使用本节点的本地坐标；未配置定位节点时生效" })
    points: Vec2[] = [];

    @property({ type: [Node], tooltip: "可选定位节点，按数组顺序连线；配置后优先使用，支持不同父节点" })
    pointNodes: Node[] = [];

    @property({ tooltip: "闭合首尾形成边界；关闭时绘制折线" })
    closed: boolean = true;

    @property({ tooltip: "线条颜色" })
    lineColor: Color = new Color(0, 255, 0, 255);

    @property({ min: 0, tooltip: "线宽，0 表示不绘制" })
    lineWidth: number = 2;

    @property({ tooltip: "仅控制编辑器场景中的调试线，不影响运行时" })
    previewInEditor: boolean = true;

    private graphics: Graphics | null = null;
    private signature: string = "";
    private readonly localPoint = new Vec3();
    private readonly drawPoints: Vec2[] = [];

    protected onEnable(): void {
        this.redraw();
    }

    protected lateUpdate(): void {
        // 仅在编辑器中跟随配置及定位节点变化，运行时不采集或绘制点位。
        if (EDITOR) {
            this.refresh(false);
        }
    }

    protected onDisable(): void {
        this.graphics?.clear();
        this.signature = "";
    }

    /** 修改配置后立即刷新，也可以等待下一帧自动刷新。 */
    public redraw(): void {
        this.refresh(true);
    }

    private refresh(force: boolean): void {
        const graphics = this.graphics || (this.graphics = this.getComponent(Graphics));
        if (!graphics) return;

        if (!EDITOR || !this.enabledInHierarchy || !this.previewInEditor) {
            graphics.clear();
            this.signature = "";
            return;
        }

        this.collectPoints();
        const color = this.lineColor;
        const signature = `${this.closed}|${this.lineWidth}|${color.r},${color.g},${color.b},${color.a}|`
            + this.drawPoints.map(point => `${point.x},${point.y}`).join(";");
        if (!force && signature === this.signature) return;
        this.signature = signature;

        graphics.clear();
        if (this.drawPoints.length < 2 || this.lineWidth <= 0) return;

        graphics.lineWidth = this.lineWidth;
        graphics.strokeColor = color;
        graphics.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
        for (let i = 1; i < this.drawPoints.length; i++) {
            graphics.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
        }
        if (this.closed) graphics.close();
        graphics.stroke();
    }

    private collectPoints(): void {
        let count = 0;
        if (this.pointNodes.length > 0) {
            const transform = this.getComponent(UITransform);
            if (transform) {
                for (const node of this.pointNodes) {
                    // 缺失点时不跨过它连线，避免显示出错误的区域边界。
                    if (!node || !node.isValid) {
                        this.drawPoints.length = 0;
                        return;
                    }
                    transform.convertToNodeSpaceAR(node.worldPosition, this.localPoint);
                    this.savePoint(count++, this.localPoint.x, this.localPoint.y);
                }
            }
        } else {
            for (const point of this.points) {
                this.savePoint(count++, point.x, point.y);
            }
        }
        this.drawPoints.length = count;
    }

    private savePoint(index: number, x: number, y: number): void {
        const point = this.drawPoints[index] || (this.drawPoints[index] = new Vec2());
        point.set(x, y);
    }
}
