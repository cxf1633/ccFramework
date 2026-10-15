import { _decorator, Canvas, Component, ResolutionPolicy, screen, view } from 'cc';

const { ccclass, property, menu, requireComponent } = _decorator;

/** Adapt the design rectangle without clipping: short screens fit height, tall screens fit width. */
@ccclass('UIAdapter')
@menu('GameFramework/UIAdapter')
@requireComponent(Canvas)
export default class UIAdapter extends Component {
    @property
    public designWidth = 750;

    @property
    public designHeight = 1334;

    private pending = false;
    private appliedWidth = 0;
    private appliedHeight = 0;
    private appliedPolicy = -1;

    protected onEnable(): void {
        this.appliedPolicy = -1;
        this.refresh();
        view.on('canvas-resize', this.requestRefresh, this);
    }

    protected onDisable(): void {
        view.off('canvas-resize', this.requestRefresh, this);
        this.unschedule(this.refresh);
        this.pending = false;
    }

    private requestRefresh(): void {
        if (this.pending) return;
        this.pending = true;
        this.scheduleOnce(this.refresh);
    }

    public refresh(): void {
        this.unschedule(this.refresh);
        this.pending = false;
        if (!this.enabledInHierarchy) return;
        const frame = screen.windowSize;
        if (![frame.width, frame.height, this.designWidth, this.designHeight].every(value => Number.isFinite(value) && value > 0)) return;
        const policy = frame.height / frame.width < this.designHeight / this.designWidth
            ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.FIXED_WIDTH;
        // setDesignResolutionSize can itself emit canvas-resize; avoid repeated application.
        if (this.appliedWidth === this.designWidth && this.appliedHeight === this.designHeight && this.appliedPolicy === policy) return;
        this.appliedWidth = this.designWidth;
        this.appliedHeight = this.designHeight;
        this.appliedPolicy = policy;
        view.setDesignResolutionSize(this.designWidth, this.designHeight, policy);
    }
}
