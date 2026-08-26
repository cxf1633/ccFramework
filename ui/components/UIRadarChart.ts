import { _decorator, Color, Component, Graphics, Vec2 } from "cc";

const { ccclass, property, requireComponent } = _decorator;

/**
 * 通用雷达图组件，用 Graphics 绘制数值连线围成的多边形数据区域。
 *
 * 只负责绘制数据区域本身，外层网格、轴线和文字由业务节点用切图和 Label 摆放。
 * 传入数值的顺序与轴顺序一一对应：第一个数值指向 startAngle 方向，其余按顺时针依次排列。
 */
@ccclass("UIRadarChart")
@requireComponent(Graphics)
export class UIRadarChart extends Component {
    /** 数值为满格时顶点到中心的距离（像素） */
    @property
    radius: number = 120;

    /** 第一个轴的角度（度），90 表示第一个轴指向正上方 */
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

    /** 展开动画时长（秒），0 表示直接显示最终形状 */
    @property
    animDuration: number = 0.35;

    private graphics: Graphics = null;
    /** 各轴归一化数值，范围 0~1 */
    private values: number[] = [];
    /** 展开动画进度，范围 0~1，1 表示已展开完成 */
    private animProgress: number = 1;
    /** 逐层修改发光透明度用的临时颜色，避免污染序列化的颜色属性 */
    private readonly layerColor: Color = new Color();

    protected onLoad(): void {
        this.graphics = this.getComponent(Graphics);
        if (!this.graphics) {
            return;
        }

        // 圆角拐角和圆头线段让多层描边叠出的发光更柔和
        this.graphics.lineJoin = Graphics.LineJoin.ROUND;
        this.graphics.lineCap = Graphics.LineCap.ROUND;
    }

    /**
     * 设置各轴数值并重新绘制。
     * @param values 归一化数值数组，超出 0~1 的部分会被钳制；数组长度即轴数量
     * @param animated 是否播放由中心向外展开的动画（默认 true）
     */
    public setValues(values: ReadonlyArray<number>, animated: boolean = true): void {
        this.values = values.map((value) => Math.min(1, Math.max(0, value || 0)));
        this.animProgress = animated && this.animDuration > 0 ? 0 : 1;
        this.redraw();
    }

    /** 清空已绘制的数据区域和数值，界面复用时可避免残留上一份数据 */
    public clear(): void {
        this.values.length = 0;
        this.animProgress = 1;
        this.graphics?.clear();
    }

    protected update(dt: number): void {
        if (this.animProgress >= 1) {
            return;
        }

        this.animProgress = Math.min(1, this.animProgress + dt / this.animDuration);
        this.redraw();
    }

    /** 按当前数值和动画进度重绘数据区域 */
    private redraw(): void {
        if (!this.graphics) {
            return;
        }

        this.graphics.clear();
        if (this.values.length < 3) {
            return;
        }

        // 数值过小时多边形会塌成一个点，直接不画，避免中心出现杂点
        const points = this.calcPoints();
        if (points.every((point) => point.length() < 1)) {
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

    /** 计算各轴顶点坐标，原点为组件所在节点的位置 */
    private calcPoints(): Vec2[] {
        // 展开动画使用 easeOutQuad，起步快、收尾稳
        const progress = 1 - (1 - this.animProgress) * (1 - this.animProgress);
        const angleStep = 360 / this.values.length;
        return this.values.map((value, index) => {
            const radian = (this.startAngle - angleStep * index) * Math.PI / 180;
            const distance = this.radius * value * progress;
            return new Vec2(Math.cos(radian) * distance, Math.sin(radian) * distance);
        });
    }

    /** 沿各顶点描出闭合路径 */
    private tracePath(points: ReadonlyArray<Vec2>): void {
        this.graphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.graphics.lineTo(points[i].x, points[i].y);
        }
        this.graphics.close();
    }
}
