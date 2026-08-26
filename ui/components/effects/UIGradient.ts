import { _decorator, Color, Component, Enum, Material, UIRenderer, Vec4 } from "cc";

const { ccclass, property, disallowMultiple, executeInEditMode, menu } = _decorator;

export enum UIGradientDirection {
    Vertical = 0,
    Horizontal = 1,
}

Enum(UIGradientDirection);

/** 为 Label、Sprite 等 UIRenderer 提供双色线性渐变。 */
@ccclass("UIGradient")
@disallowMultiple
@executeInEditMode
@menu("GameFramework/UI/Effects/UIGradient")
export class UIGradient extends Component {
    @property({ type: Material, serializable: true })
    private _gradientMaterial: Material | null = null;

    @property({ type: Material, displayName: "渐变材质" })
    public get gradientMaterial(): Material | null {
        return this._gradientMaterial;
    }

    public set gradientMaterial(value: Material | null) {
        if (this._gradientMaterial === value) {
            return;
        }
        this.restoreMaterial();
        this._gradientMaterial = value;
        this.refresh();
    }

    @property({ serializable: true })
    private _startColor: Color = new Color(255, 255, 255, 255);

    @property({ type: Color, displayName: "起始颜色" })
    public get startColor(): Color {
        return this._startColor;
    }

    public set startColor(value: Color) {
        this._startColor = value.clone();
        this.refreshProperties();
    }

    @property({ serializable: true })
    private _endColor: Color = new Color(255, 255, 255, 255);

    @property({ type: Color, displayName: "结束颜色" })
    public get endColor(): Color {
        return this._endColor;
    }

    public set endColor(value: Color) {
        this._endColor = value.clone();
        this.refreshProperties();
    }

    @property({ type: UIGradientDirection, serializable: true })
    private _direction: UIGradientDirection = UIGradientDirection.Vertical;

    @property({ type: UIGradientDirection, displayName: "渐变方向" })
    public get direction(): UIGradientDirection {
        return this._direction;
    }

    public set direction(value: UIGradientDirection) {
        this._direction = value;
        this.refreshProperties();
    }

    private uiRenderer: UIRenderer | null = null;
    private materialInstance: Material | null = null;
    private previousMaterial: Material | null = null;
    private hasPreviousMaterial: boolean = false;
    private missingRendererWarned: boolean = false;

    protected onLoad(): void {
        this.resolveRenderer();
    }

    protected onEnable(): void {
        this.refresh();
    }

    protected onDisable(): void {
        this.restoreMaterial();
    }

    protected onDestroy(): void {
        this.restoreMaterial();
        this.uiRenderer = null;
    }

    /** 同时更新渐变的起始色和结束色。 */
    public setColors(startColor: Color, endColor: Color): void {
        this._startColor = startColor.clone();
        this._endColor = endColor.clone();
        this.refreshProperties();
    }

    /** 重新应用材质并刷新当前属性。 */
    public refresh(): void {
        if (!this.enabled || !this.node?.activeInHierarchy || !this._gradientMaterial) {
            return;
        }

        const renderer = this.resolveRenderer();
        if (!renderer) {
            return;
        }

        if (!this.hasPreviousMaterial) {
            this.previousMaterial = renderer.customMaterial;
            this.hasPreviousMaterial = true;
        }

        if (!this.materialInstance || renderer.customMaterial !== this.materialInstance) {
            renderer.customMaterial = this._gradientMaterial;
            this.materialInstance = renderer.getMaterialInstance(0);
        }

        this.refreshProperties();
    }

    private resolveRenderer(): UIRenderer | null {
        if (this.uiRenderer?.isValid) {
            return this.uiRenderer;
        }

        this.uiRenderer = this.node?.getComponent(UIRenderer) || null;
        if (!this.uiRenderer && !this.missingRendererWarned) {
            this.missingRendererWarned = true;
            console.warn("[UIGradient] UIRenderer component is not found.");
        }
        return this.uiRenderer;
    }

    private refreshProperties(): void {
        if (!this.materialInstance) {
            this.refresh();
            return;
        }

        this.materialInstance.setProperty("startColor", this.toVec4(this._startColor));
        this.materialInstance.setProperty("endColor", this.toVec4(this._endColor));
        this.materialInstance.setProperty("gradientDirection", this._direction);
    }

    private restoreMaterial(): void {
        if (this.uiRenderer?.isValid && this.hasPreviousMaterial) {
            this.uiRenderer.customMaterial = this.previousMaterial;
        }
        this.materialInstance = null;
        this.previousMaterial = null;
        this.hasPreviousMaterial = false;
    }

    private toVec4(color: Color): Vec4 {
        return new Vec4(
            color.r / 255,
            color.g / 255,
            color.b / 255,
            color.a / 255,
        );
    }
}
