import { _decorator, Color, UIRenderer } from "cc";
import { resources } from "cc";
import { BaseMaterrialController } from "./BaseMaterrialController";
import { Vec4 } from "cc";
import { Material } from "cc";
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
            resources.load("shader/gradient", Material, (err, mat) => {
                if (err || !mat || !this.isValid) return;
                this.targetMaterial = mat;
                this.addEffect();
                if (!this._material && this._uiRender) {
                    this._material = this._uiRender.customMaterial as Material;
                    if (this._material) {
                        this.updateMaterialProperties();
                    }
                }
            });
        }
    }

    setGradientColor(startColor: Color, endColor: Color) {
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
        const sV4 = new Vec4(
            this.startColor.r / 255,
            this.startColor.g / 255,
            this.startColor.b / 255,
            this.startColor.a / 255
        );
        const eV4 = new Vec4(
            this.endColor.r / 255,
            this.endColor.g / 255,
            this.endColor.b / 255,
            this.endColor.a / 255
        );
        if (this._material) {
            this._material.setProperty("startColor", sV4);
            this._material.setProperty("endColor", eV4);
        }
    }
}