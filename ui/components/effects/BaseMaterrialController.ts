import { _decorator, Component, Sprite, Color, Material } from 'cc';
import { Logger } from '../../../../extensions/oops-plugin-framework/assets/core/common/log/Logger';
import { Label } from 'cc';
import { UIRenderer } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * BaseMaterrialController组件
 * 材质基础控制器
 */
@ccclass('BaseMaterrialController')
@executeInEditMode // 允许在编辑器模式下运行
export class BaseMaterrialController extends Component {
    protected _sprite: Sprite = null!;
    // protected _label: Label = null!;
    protected _uiRender: UIRenderer | null = null!;
    protected _material: Material | null = null!;

    @property(Material)
    protected targetMaterial: Material = null!;

    @property({ tooltip: "是否在加载时添加材质" })
    protected bAddOnLoad: boolean = true;

    /**
     * 属性变化回调
     * 在编辑器模式下，当属性发生变化时自动调用
     */
    protected onPropertyChanged(propName: string): void {
        // 只在编辑器模式下处理属性变化
        this.updateMaterialProperties();
    }

    // 初始化函数
    onLoad(): void {
        this._uiRender = this.node.getComponent(UIRenderer)!;
        if (!this._uiRender) {
            console.error("BaseMaterrialController: 未找到UIRenderer组件");
            return;
        }
        if (this.bAddOnLoad) {
            this.addEffect();
        }
    }

    protected start(): void {
        // 加载并设置材质
        this.loadAndSetMaterial();
    }

    // 加载并设置材质
    loadAndSetMaterial(): void {
        // 更新材质属性
        this.refreshMaterialEffect();
    }

    // 更新材质属性
    protected updateMaterialProperties(): void {


    }

    public refreshMaterialEffect(): void {

        if (!this._uiRender) {
            // console.error("BaseMaterrialController: 无法获取Sprite组件");
            return;
        }

        // if (!this._uiRender.customMaterial) {
        //     return;
        // }

        if (!this._material) {
            this._material = this._uiRender.getMaterialInstance(0);
        }

        if (!this._material) {
            return;
        }
        this.updateMaterialProperties();
    }

    // 属性变化时更新材质
    protected updateProperties(): void {

        if (!this._uiRender)
            return;

        if (!this._uiRender.customMaterial) {
            return;
        }

        this.refreshMaterialEffect();
    }

    // 每帧更新
    protected update(deltaTime: number): void {
        // 只在游戏运行时每帧更新材质属性
        // 在编辑器模式下，通过onPropertyChanged来更新，避免性能问题
        this.refreshMaterialEffect();
    }

    // 组件激活时调用
    protected onEnable(): void {
        // 在编辑器模式下，确保UIRenderer组件存在
        if (!this._uiRender) {
            this._uiRender = this.node.getComponent(UIRenderer);
        }

        // 更新材质属性
        this.refreshMaterialEffect();
    }

    public reloadUIRender(): void {
        this._uiRender = this.node.getComponent(UIRenderer);
        if (!this._uiRender) {
            return;
        }

        if (!this.targetMaterial) {
            return;
        }
        this._uiRender.customMaterial = this.targetMaterial;
        this._material = this._uiRender.getMaterialInstance(0);
    }

    public addEffect(): void {
        if (!this._uiRender) {
            return;
        }

        if (this._uiRender.customMaterial === this.targetMaterial) {
            this.refreshMaterialEffect();
            return;
        }

        // this._uiRender.customMaterial = this.targetMaterial;
        // this._material = this._uiRender.getMaterialInstance(0);

        this.reloadUIRender();

        this.refreshMaterialEffect();
    }

    public removeEffect(): void {
        if (!this._uiRender) {
            return;
        }
        this._uiRender.customMaterial = null;
    }

    // 组件禁用时调用
    protected onDisable(): void {

    }

    // 组件销毁时调用
    protected onDestroy(): void {

    }


}