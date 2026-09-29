import { _decorator, Color } from 'cc';
import { Logger } from '../../../../extensions/oops-plugin-framework/assets/core/common/log/Logger';
import { BaseMaterrialController } from './BaseMaterrialController';
import { Vec4 } from 'cc';
const { ccclass, property } = _decorator;

/**
 * SpriteGlowOutterController组件
 * 外发光材质
 */
@ccclass('SpriteGlowOutterController')
// @executeInEditMode // 允许在编辑器模式下运行
export class SpriteGlowOutterController extends BaseMaterrialController {

    @property({ tooltip: "光束颜色" })
    public lightColor: Color = new Color(255, 255, 255, 255);
    @property({ tooltip: "光束宽度", range: [0, 100], slide: true })
    private glowWidthSlider: number = 50;
    @property({ tooltip: "光束阈值", range: [0, 100], slide: true })
    private glowThresholdSlider: number = 50;

    // 更新材质属性
    protected updateMaterialProperties(): void {
        if (!this._material) {
            return;
        }

        let realGlowWidthProgress = this.glowWidthSlider * 0.001;
        let realGlowThresholdProgress = this.glowThresholdSlider * 0.01;

        const v4 = new Vec4(
            this.lightColor.r / 255,
            this.lightColor.g / 255,
            this.lightColor.b / 255,
            this.lightColor.a / 255
        );

        this._material.setProperty("glowColor", v4);
        this._material.setProperty("glowColorSize", realGlowWidthProgress);
        this._material.setProperty("glowThreshold", realGlowThresholdProgress);

    }
}