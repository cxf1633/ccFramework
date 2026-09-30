import { _decorator, Color, UIRenderer, Vec4 } from "cc";
import { BaseMaterrialController } from "./BaseMaterrialController";

const { ccclass, property } = _decorator;

@ccclass("GradientController")
export class GradientController extends BaseMaterrialController {

    @property({ tooltip: "startColor" })
    public startColor: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: "endColor" })
    public endColor: Color = new Color(255, 255, 255, 255);

    onLoad(): void {
        super.onLoad();
        if (!this.targetMaterial) {
            console.warn(`[GradientController] ${this.node.name} 未配置渐变材质，请在 Inspector 中指定 framework/ui/materials/gradient/gradient.mtl`);
        }
    }

    setGradientColor(startColor: Color, endColor: Color): void {
        this.startColor = startColor;
        this.endColor = endColor;
        if (!this._uiRender) {
            this._uiRender = this.node.getComponent(UIRenderer);
        }
        if (!this._material) {
            this.addEffect();
        } else {
            this.updateMaterialProperties();
        }
    }

    protected updateMaterialProperties(): void {
        if (!this._material) return;

        const start = new Vec4(
            this.startColor.r / 255,
            this.startColor.g / 255,
            this.startColor.b / 255,
            this.startColor.a / 255,
        );
        const end = new Vec4(
            this.endColor.r / 255,
            this.endColor.g / 255,
            this.endColor.b / 255,
            this.endColor.a / 255,
        );

        this._material.setProperty("startColor", start);
        this._material.setProperty("endColor", end);
    }
}
