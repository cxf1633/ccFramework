import { _decorator, CCFloat, CCString, Color, Component, Graphics, Node, UITransform, Vec2, Vec3 } from "cc";
import { EDITOR } from "cc/env";

const { ccclass, property, requireComponent, executeInEditMode, playOnFocus } = _decorator;

/**
 * 通用雷达图组件，用 Graphics 绘制数值连线围成的多边形数据区域。
 *
 * 只负责绘制数据区域本身，外层网格、轴线和文字由业务节点用切图和 Label 摆放。
 * 传入数值的顺序与轴顺序一一对应：配置了 axisNodes 时按节点顺序，
 * 否则第一个数值指向 startAngle 方向，其余按顺时针依次排列。
 * 配置了 axisKeys 后可以改用 setValuesByKey 按名字传值，避免顺序错位。
 */
@ccclass("UIRadarChart")
@requireComponent(Graphics)
@executeInEditMode(true)
@playOnFocus
export class UIRadarChart extends Component {
    /**
     * 雷达图中心定位节点，各轴数值为 0 时顶点都收缩到这里。
     * 可以直接摆到外层网格切图的中心上，节点挂在任意父节点下都可以；
     * 留空时中心就是组件所在节点自身的位置。
     */
    @property(Node)
    centerNode: Node = null;

    /**
     * 各轴顶点定位节点，节点数量即多边形边数，顺序与 setValues 传入的数值一一对应。
     * 每个节点的位置代表该轴数值为满格时的顶点位置，可直接摆到外层网格切图的顶点上，
     * 节点挂在任意父节点下都可以。配置了该列表时忽略 radius 和 startAngle。
     */
    @property([Node])
    axisNodes: Node[] = [];

    /**
     * 各轴名字，按下标与 axisNodes 一一对应，供 setValuesByKey 按名字取值使用。
     * 留空表示只用下标对应，此时 setValuesByKey 不可用。
     */
    @property([CCString])
    axisKeys: string[] = [];

    /** 数值为满格时顶点到中心的距离（像素），仅在未配置 axisNodes 时使用 */
    @property
    radius: number = 120;

    /** 第一个轴的角度（度），90 表示第一个轴指向正上方，仅在未配置 axisNodes 时使用 */
    @property
    startAngle: number = 90;

    /** 数据区域填充颜色 */
    @property(Color)
    fillColor: Color = new Color(31, 214, 232, 90);

    /** 数据区域描边颜色 */
    @property(Color)
    strokeColor: Color = new Color(120, 246, 255, 255);

    /** 外发光颜色，alpha 越低发光越弱 */
    @property(Color)
    glowColor: Color = new Color(120, 246, 255, 70);

    /** 描边宽度（像素） */
    @property
    strokeWidth: number = 2;

    /** 外发光在描边之外额外扩散的宽度（像素） */
    @property
    glowWidth: number = 8;

    /** 外发光层数，层数越多过渡越柔和，0 表示不绘制外发光 */
    @property
    glowLayers: number = 2;

    /** 数值变化动画时长（秒），0 表示直接显示最终形状 */
    @property
    animDuration: number = 0.35;

    /** 是否在编辑器里按 previewValues 预览数据区域，方便美术调颜色和发光参数 */
    @property
    previewInEditor: boolean = true;

    /** 编辑器预览用的归一化数值，按下标与轴一一对应，只在编辑器里生效 */
    @property([CCFloat])
    previewValues: number[] = [];

    private graphics: Graphics = null;
    private uiTransform: UITransform = null;
    /** 动画起点的各轴归一化数值，范围 0~1 */
    private fromValues: number[] = [];
    /** 动画终点的各轴归一化数值，范围 0~1 */
    private toValues: number[] = [];
    /** 动画进度，范围 0~1，1 表示已到达终点数值 */
    private animProgress: number = 1;
    /** 逐层修改发光透明度用的临时颜色，避免污染序列化的颜色属性 */
    private readonly layerColor: Color = new Color();
    /** 定位节点坐标换算用的临时向量 */
    private readonly localPoint: Vec3 = new Vec3();
    /** 中心节点坐标换算用的临时向量 */
    private readonly centerLocalPoint: Vec3 = new Vec3();
    /** 编辑器预览参数指纹，用于判断是否需要重绘 */
    private previewSignature: string = "";

    protected onLoad(): void {
        this.graphics = this.getComponent(Graphics);
        this.uiTransform = this.getComponent(UITransform);
        if (!this.graphics) {
            return;
        }

        // 圆角拐角和圆头线段让多层描边叠出的发光更柔和
        this.graphics.lineJoin = Graphics.LineJoin.ROUND;
        this.graphics.lineCap = Graphics.LineCap.ROUND;

        this.validateAxisNodes();
        this.validateAxisKeys();
        this.validateAxisOrder();
    }

    /**
     * 设置各轴数值并重新绘制，动画从当前显示的形状过渡到新数值。
     * @param values 归一化数值数组，超出 0~1 的部分会被钳制；配置了 axisNodes 时按下标与节点
     *               一一对应，缺失的下标按 0 处理，未配置 axisNodes 时数组长度即轴数量
     * @param animated 是否播放过渡动画（默认 true），首次设置时表现为由中心向外展开
     */
    public setValues(values: ReadonlyArray<number>, animated: boolean = true): void {
        if (this.axisNodes.length > 0 && values.length !== this.axisNodes.length) {
            console.warn(`[UIRadarChart] ${this.node.name} 传入 ${values.length} 个数值，`
                + `但配置了 ${this.axisNodes.length} 个轴节点，缺失的轴按 0 处理。`);
        }

        // 先按当前进度快照出正在显示的形状，作为新动画的起点
        this.fromValues = this.snapshotCurrentValues(values.length);
        this.toValues = values.map((value) => this.clampValue(value));
        this.animProgress = animated && this.animDuration > 0 ? 0 : 1;
        this.redraw();
    }

    /**
     * 按轴名字设置各轴数值，需要先在 axisKeys 里配置好各轴名字。
     * @param values 轴名字到归一化数值的映射，缺失的轴按 0 处理
     * @param animated 是否播放过渡动画（默认 true）
     */
    public setValuesByKey(values: Readonly<Record<string, number>>, animated: boolean = true): void {
        if (this.axisKeys.length === 0) {
            console.warn(`[UIRadarChart] ${this.node.name} 未配置 axisKeys，无法按名字设置数值。`);
            return;
        }

        this.setValues(this.axisKeys.map((axisKey) => values?.[axisKey] ?? 0), animated);
    }

    /** 清空已绘制的数据区域和数值，界面复用时可避免残留上一份数据 */
    public clear(): void {
        this.fromValues.length = 0;
        this.toValues.length = 0;
        this.animProgress = 1;
        this.graphics?.clear();
    }

    protected update(dt: number): void {
        if (EDITOR) {
            this.updateInEditor();
            return;
        }

        if (this.animProgress >= 1) {
            return;
        }

        this.animProgress = Math.min(1, this.animProgress + dt / this.animDuration);
        this.redraw();
    }

    /** 编辑器里按 previewValues 实时重绘，便于调整颜色、描边和发光参数 */
    private updateInEditor(): void {
        if (!this.previewInEditor) {
            // 关闭预览后清掉上一次预览留下的图形
            if (this.previewSignature !== "") {
                this.previewSignature = "";
                this.clear();
            }
            return;
        }

        // 编辑器每帧都会走到这里，参数没变时跳过重绘，避免无意义的顶点重建
        const signature = [
            this.previewValues.join(","),
            this.centerNode?.isValid ? `${this.centerNode.position.x},${this.centerNode.position.y}` : "-",
            this.axisNodes.map((axisNode) => axisNode?.isValid ? `${axisNode.position.x},${axisNode.position.y}` : "-").join(";"),
            this.fillColor.toHEX(), this.strokeColor.toHEX(), this.glowColor.toHEX(),
            this.strokeWidth, this.glowWidth, this.glowLayers,
            this.radius, this.startAngle,
        ].join("|");
        if (signature === this.previewSignature) {
            return;
        }

        this.previewSignature = signature;
        this.fromValues = this.previewValues.map((value) => this.clampValue(value));
        this.toValues = this.fromValues;
        this.animProgress = 1;
        this.redraw();
    }

    /** 按当前数值和动画进度重绘数据区域 */
    private redraw(): void {
        if (!this.graphics) {
            return;
        }

        this.graphics.clear();
        if (this.axisCount < 3) {
            return;
        }

        // 数值过小时多边形会塌成一个点，直接不画，避免中心出现杂点
        const points = this.calcPoints();
        const center = this.calcCenter();
        if (points.every((point) => Vec2.distance(point, center) < 1)) {
            return;
        }

        // 由外到内叠加发光层：越靠外越宽越淡。Graphics 在每次 fill/stroke 后
        // 会把路径偏移前移，因此每一层都要重新描一遍路径，只渲染当前这一层。
        for (let layer = this.glowLayers; layer >= 1; layer--) {
            this.layerColor.set(this.glowColor);
            this.layerColor.a = Math.round(this.glowColor.a * (1 - (layer - 1) / this.glowLayers));
            this.tracePath(points);
            this.graphics.lineWidth = this.strokeWidth + this.glowWidth * layer / this.glowLayers;
            this.graphics.strokeColor = this.layerColor;
            this.graphics.stroke();
        }

        this.tracePath(points);
        this.graphics.fillColor = this.fillColor;
        this.graphics.fill();

        this.tracePath(points);
        this.graphics.lineWidth = this.strokeWidth;
        this.graphics.strokeColor = this.strokeColor;
        this.graphics.stroke();
    }

    /** 当前轴数量：配置了定位节点时以节点数量为准，否则取数值数量 */
    private get axisCount(): number {
        return this.axisNodes.length > 0 ? this.axisNodes.length : this.toValues.length;
    }

    /** 计算各轴顶点坐标，坐标系为组件所在节点，收缩中心为 centerNode */
    private calcPoints(): Vec2[] {
        // 数值过渡使用 easeOutQuad，起步快、收尾稳
        const progress = 1 - (1 - this.animProgress) * (1 - this.animProgress);
        return this.axisNodes.length > 0
            ? this.calcPointsByAxisNodes(progress)
            : this.calcPointsByRadius(progress);
    }

    /** 计算中心点在本节点坐标系下的位置，未配置中心节点时为本节点原点 */
    private calcCenter(): Vec2 {
        if (!this.centerNode?.isValid || !this.uiTransform) {
            return new Vec2();
        }

        this.uiTransform.convertToNodeSpaceAR(this.centerNode.worldPosition, this.centerLocalPoint);
        return new Vec2(this.centerLocalPoint.x, this.centerLocalPoint.y);
    }

    /** 按定位节点位置计算顶点：节点位置即该轴满格时的顶点，数值按比例向中心收缩 */
    private calcPointsByAxisNodes(progress: number): Vec2[] {
        const center = this.calcCenter();
        return this.axisNodes.map((axisNode, index) => {
            if (!axisNode?.isValid || !this.uiTransform) {
                return new Vec2(center.x, center.y);
            }

            // 定位节点可能挂在别的父节点下，换算到本节点坐标系再按数值从中心向外插值
            this.uiTransform.convertToNodeSpaceAR(axisNode.worldPosition, this.localPoint);
            const value = this.calcValue(index, progress);
            return new Vec2(
                center.x + (this.localPoint.x - center.x) * value,
                center.y + (this.localPoint.y - center.y) * value,
            );
        });
    }

    /** 按半径和起始角度均分计算顶点，未配置定位节点时使用 */
    private calcPointsByRadius(progress: number): Vec2[] {
        const center = this.calcCenter();
        const angleStep = 360 / this.toValues.length;
        return this.toValues.map((_value, index) => {
            const radian = (this.startAngle - angleStep * index) * Math.PI / 180;
            const distance = this.radius * this.calcValue(index, progress);
            return new Vec2(center.x + Math.cos(radian) * distance, center.y + Math.sin(radian) * distance);
        });
    }

    /** 按动画进度插值出某个轴当前的归一化数值 */
    private calcValue(index: number, progress: number): number {
        const fromValue = this.fromValues[index] ?? 0;
        const toValue = this.toValues[index] ?? 0;
        return fromValue + (toValue - fromValue) * progress;
    }

    /** 快照当前正在显示的各轴数值，作为下一段动画的起点 */
    private snapshotCurrentValues(count: number): number[] {
        const progress = 1 - (1 - this.animProgress) * (1 - this.animProgress);
        const snapshot: number[] = [];
        for (let i = 0; i < count; i++) {
            snapshot.push(this.calcValue(i, progress));
        }
        return snapshot;
    }

    /** 把数值钳制到 0~1，非法值按 0 处理 */
    private clampValue(value: number): number {
        return Math.min(1, Math.max(0, value || 0));
    }

    /** 沿各顶点描出闭合路径 */
    private tracePath(points: ReadonlyArray<Vec2>): void {
        this.graphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.graphics.lineTo(points[i].x, points[i].y);
        }
        this.graphics.close();
    }

    /** 检查轴定位节点是否有遗漏 */
    private validateAxisNodes(): void {
        const missingCount = this.axisNodes.filter((axisNode) => !axisNode?.isValid).length;
        if (missingCount > 0) {
            console.warn(`[UIRadarChart] ${this.node.name} 有 ${missingCount} 个轴定位节点未配置，这些轴会画在中心点。`);
        }
    }

    /** 检查轴名字数量是否与轴节点数量对齐 */
    private validateAxisKeys(): void {
        if (this.axisKeys.length > 0 && this.axisNodes.length > 0 && this.axisKeys.length !== this.axisNodes.length) {
            console.warn(`[UIRadarChart] ${this.node.name} 配置了 ${this.axisKeys.length} 个轴名字，`
                + `但有 ${this.axisNodes.length} 个轴节点，两者应一一对应。`);
        }
    }

    /**
     * 检查轴定位节点是否沿圆周依次排列。
     * 依次累加相邻轴的同向夹角，绕满一圈应正好是 360 度；
     * 明显超出说明顺序来回跳，连出来的多边形会自交。
     */
    private validateAxisOrder(): void {
        if (this.axisNodes.length < 3 || !this.uiTransform) {
            return;
        }

        const center = this.calcCenter();
        const angles: number[] = [];
        for (const axisNode of this.axisNodes) {
            if (!axisNode?.isValid) {
                return;
            }

            this.uiTransform.convertToNodeSpaceAR(axisNode.worldPosition, this.localPoint);
            angles.push(Math.atan2(this.localPoint.y - center.y, this.localPoint.x - center.x) * 180 / Math.PI);
        }

        // 顺时针和逆时针各算一遍，任意一个方向绕满一圈即为合法顺序
        const clockwiseSum = this.sumTurnAngles(angles, true);
        const counterClockwiseSum = this.sumTurnAngles(angles, false);
        const tolerance = 1;
        if (Math.abs(clockwiseSum - 360) > tolerance && Math.abs(counterClockwiseSum - 360) > tolerance) {
            console.warn(`[UIRadarChart] ${this.node.name} 轴节点顺序不是沿圆周排列，多边形会自交，`
                + `请按顺时针或逆时针依次拖入 axisNodes。`);
        }
    }

    /** 按指定方向累加相邻轴之间的夹角，返回绕行总角度 */
    private sumTurnAngles(angles: ReadonlyArray<number>, clockwise: boolean): number {
        let total = 0;
        for (let i = 0; i < angles.length; i++) {
            const current = angles[i];
            const next = angles[(i + 1) % angles.length];
            const delta = clockwise ? current - next : next - current;
            total += (delta % 360 + 360) % 360;
        }
        return total;
    }
}
