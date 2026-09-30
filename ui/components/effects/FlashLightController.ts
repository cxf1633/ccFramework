import { _decorator, Component, Sprite, Color, Material } from 'cc';
import { BaseMaterrialController } from './BaseMaterrialController';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * FlashLightController组件
 * 用于控制flash-light-fn2.effect着色器的参数
 * 可在Cocos Creator编辑器面板上调节所有着色器属性
 */
@ccclass('FlashLightController')
// @executeInEditMode // 允许在编辑器模式下运行
export class FlashLightController extends BaseMaterrialController {

    // 声明着色器属性对应的类成员
    @property({ tooltip: "光束颜色" })
    public lightColor: Color = new Color(255, 255, 0, 255);

    @property({ tooltip: "光束倾斜角度", range: [0, 360], slide: true })
    public lightAngle: number = 45.0;

    @property({ tooltip: "光束宽度", range: [0, 1], slide: true })
    public lightWidth: number = 0.2;

    @property({ tooltip: "是否启用光束渐变" })
    public enableGradient: boolean = true;

    @property({ tooltip: "是否裁剪透明区域上的光" })
    public cropAlpha: boolean = true;

    @property({ tooltip: "是否启用迷雾效果" })
    public enableFog: boolean = false;

    @property({ tooltip: "循环时间", range: [0, 10], slide: true })
    public loopTime: number = 1.0;

    @property({ tooltip: "刷新间隔", range: [0, 10], slide: true })
    public timeInterval: number = 3.0;

    @property({ tooltip: "透明度阈值", range: [0, 1], slide: true })
    public alphaThreshold: number = 0.5;


    // 更新材质属性
    protected updateMaterialProperties(): void {

        if (!this._material) {
            return;
        }

        // 更新光束颜色
        this._material.setProperty('lightColor', this.lightColor);

        // 更新光束角度
        this._material.setProperty('lightAngle', this.lightAngle);

        // 更新光束宽度
        this._material.setProperty('lightWidth', this.lightWidth);

        // 更新是否启用光束渐变
        this._material.setProperty('enableGradient', this.enableGradient ? 1.0 : 0.0);

        // 更新是否裁剪透明区域上的光
        this._material.setProperty('cropAlpha', this.cropAlpha ? 1.0 : 0.0);

        // 更新是否启用迷雾效果
        this._material.setProperty('enableFog', this.enableFog ? 1.0 : 0.0);

        // 更新循环时间
        this._material.setProperty('loopTime', this.loopTime);

        // 更新刷新间隔
        this._material.setProperty('timeInterval', this.timeInterval);

        // 更新透明度阈值
        this._material.setProperty('alphaThreshold', this.alphaThreshold);

    }

}
