import { _decorator, instantiate, Node, Slider, UITransform } from "cc";

const { ccclass, property } = _decorator;

const SLIDER_EVENT = "slide";

@ccclass("UIStepSlider")
export class UIStepSlider extends Slider {
    /** 步进变化事件名，外部可通过 node.on("step-changed", ...) 监听 */
    public static readonly STEP_CHANGED_EVENT = "step-changed";

    /** 分隔线的预制模板节点，用于在滑动条上生成每个档位的刻度分隔线 */
    @property(Node)
    img_split: Node = null;

    /** 当前生成的所有分隔线节点 */
    private splitNodes: Node[] = [];
    /** 总档位数（步进数量） */
    private stepCount: number = 0;
    /** 当前选中的档位索引（从 0 开始） */
    private selectedIndex: number = 0;

    protected start(): void {
        // 先移除旧的监听再注册，防止重复监听导致回调执行多次
        this.node.off(SLIDER_EVENT, this.onSliderChanged, this);
        this.node.on(SLIDER_EVENT, this.onSliderChanged, this);
    }

    /**
     * 设置总档位数并刷新分隔线
     * @param stepCount 档位数量（会向下取整并保证不小于 0）
     * @param selectedIndex 设置完成后选中的档位索引（可选，默认保持当前索引）
     */
    public setStepCount(stepCount: number, selectedIndex: number = this.selectedIndex): void {
        this.stepCount = Math.max(0, Math.floor(stepCount));
        this.selectedIndex = this.clampIndex(selectedIndex);
        this.setProgressByIndex(this.selectedIndex);
        this.refreshSplitNodes();
    }

    /** 获取当前选中的档位索引（从 0 开始） */
    public getSelectedIndex(): number {
        return this.selectedIndex;
    }

    /**
     * 设置当前选中的档位索引
     * @param index 目标档位索引（会自动钳制到合法范围）
     * @param emitEvent 是否派发 step-changed 事件（默认 true）
     */
    public setSelectedIndex(index: number, emitEvent: boolean = true): void {
        this.selectedIndex = this.clampIndex(index);
        this.setProgressByIndex(this.selectedIndex);
        if (emitEvent) {
            this.emitStepChanged();
        }
    }

    /** 销毁并清空所有已生成的分隔线节点 */
    public clearSplitNodes(): void {
        this.splitNodes.forEach((splitNode) => {
            if (splitNode?.isValid) {
                splitNode.destroy();
            }
        });
        this.splitNodes.length = 0;
    }

    /** 根据当前档位数重新生成分隔线节点 */
    private refreshSplitNodes(): void {
        // 先清空旧的分隔线，保证重新生成时不残留
        this.clearSplitNodes();

        // 未配置分隔线模板节点则直接返回
        if (!this.img_split?.isValid) {
            return;
        }

        this.img_split.active = false;
        // 档位 <= 2 时没有中间刻度，无需生成分隔线
        if (this.stepCount <= 2) {
            this.keepHandleOnTop(this.img_split.parent || this.node);
            return;
        }

        const sliderTransform = this.node.getComponent(UITransform);
        if (!sliderTransform) {
            return;
        }

        // 计算分隔线起始位置、间距，并逐个实例化出中间档位的分隔线
        const splitParent = this.img_split.parent || this.node;
        const sliderWidth = sliderTransform.contentSize.width;
        const startX = -sliderWidth * sliderTransform.anchorPoint.x;
        const splitStep = sliderWidth / (this.stepCount - 1);
        const splitY = this.img_split.position.y;
        const splitZ = this.img_split.position.z;

        for (let i = 1; i < this.stepCount - 1; i++) {
            const splitNode = instantiate(this.img_split);
            splitNode.name = `${this.img_split.name}_${i}`;
            splitNode.active = true;
            splitParent.addChild(splitNode);
            splitNode.setPosition(startX + splitStep * i, splitY, splitZ);
            this.splitNodes.push(splitNode);
        }

        this.keepHandleOnTop(splitParent);
    }

    /** 保证滑动条上的滑块手柄始终显示在最上层（不被分隔线遮挡） */
    private keepHandleOnTop(splitParent: Node): void {
        const handleNode = this.node.getChildByName("Handle");
        if (handleNode?.parent === splitParent) {
            handleNode.setSiblingIndex(splitParent.children.length - 1);
        }
    }

    /** 滑块拖动回调：将滑动进度吸附到最近的档位并派发事件 */
    private onSliderChanged(): void {
        if (this.stepCount <= 1) {
            this.selectedIndex = 0;
            this.progress = 0;
            this.emitStepChanged();
            return;
        }

        this.selectedIndex = this.clampIndex(Math.round(this.progress * (this.stepCount - 1)));
        this.setProgressByIndex(this.selectedIndex);
        this.emitStepChanged();
    }

    /** 根据档位索引计算并设置滑块的进度（0~1） */
    private setProgressByIndex(index: number): void {
        this.progress = this.stepCount > 1 ? index / (this.stepCount - 1) : 0;
    }

    /** 将索引钳制到合法范围 [0, stepCount - 1]，并向下取整 */
    private clampIndex(index: number): number {
        if (this.stepCount <= 1) {
            return 0;
        }

        return Math.max(0, Math.min(this.stepCount - 1, Math.round(index)));
    }

    /** 向外派发 step-changed 事件，参数为当前索引、进度和组件本身 */
    private emitStepChanged(): void {
        this.node.emit(UIStepSlider.STEP_CHANGED_EVENT, this.selectedIndex, this.progress, this);
    }
}
