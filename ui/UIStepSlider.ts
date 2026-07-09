import { _decorator, instantiate, Node, Slider, UITransform } from "cc";

const { ccclass, property } = _decorator;

const SLIDER_EVENT = "slide";

@ccclass("UIStepSlider")
export class UIStepSlider extends Slider {
    public static readonly STEP_CHANGED_EVENT = "step-changed";

    @property(Node)
    img_split: Node = null;

    private splitNodes: Node[] = [];
    private stepCount: number = 0;
    private selectedIndex: number = 0;

    protected start(): void {
        this.node.off(SLIDER_EVENT, this.onSliderChanged, this);
        this.node.on(SLIDER_EVENT, this.onSliderChanged, this);
    }

    public setStepCount(stepCount: number, selectedIndex: number = this.selectedIndex): void {
        this.stepCount = Math.max(0, Math.floor(stepCount));
        this.selectedIndex = this.clampIndex(selectedIndex);
        this.setProgressByIndex(this.selectedIndex);
        this.refreshSplitNodes();
    }

    public getSelectedIndex(): number {
        return this.selectedIndex;
    }

    public setSelectedIndex(index: number, emitEvent: boolean = true): void {
        this.selectedIndex = this.clampIndex(index);
        this.setProgressByIndex(this.selectedIndex);
        if (emitEvent) {
            this.emitStepChanged();
        }
    }

    public clearSplitNodes(): void {
        this.splitNodes.forEach((splitNode) => {
            if (splitNode?.isValid) {
                splitNode.destroy();
            }
        });
        this.splitNodes.length = 0;
    }

    private refreshSplitNodes(): void {
        this.clearSplitNodes();

        if (!this.img_split?.isValid) {
            return;
        }

        this.img_split.active = false;
        if (this.stepCount <= 2) {
            this.keepHandleOnTop(this.img_split.parent || this.node);
            return;
        }

        const sliderTransform = this.node.getComponent(UITransform);
        if (!sliderTransform) {
            return;
        }

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

    private keepHandleOnTop(splitParent: Node): void {
        const handleNode = this.node.getChildByName("Handle");
        if (handleNode?.parent === splitParent) {
            handleNode.setSiblingIndex(splitParent.children.length - 1);
        }
    }

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

    private setProgressByIndex(index: number): void {
        this.progress = this.stepCount > 1 ? index / (this.stepCount - 1) : 0;
    }

    private clampIndex(index: number): number {
        if (this.stepCount <= 1) {
            return 0;
        }

        return Math.max(0, Math.min(this.stepCount - 1, Math.round(index)));
    }

    private emitStepChanged(): void {
        this.node.emit(UIStepSlider.STEP_CHANGED_EVENT, this.selectedIndex, this.progress, this);
    }
}
