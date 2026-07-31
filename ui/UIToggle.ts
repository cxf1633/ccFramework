import { _decorator, Button, Component, Node } from "cc";

const { ccclass, property, requireComponent } = _decorator;

export interface UIToggleGroupLike {
    select(toggle: UIToggle): void;
}

@ccclass("UIToggle")
@requireComponent(Button)
export class UIToggle extends Component {
    @property(Node)
    public selectNode: Node | null = null;

    private group: UIToggleGroupLike | null = null;
    private selected = false;

    protected onLoad(): void {
        if (!this.selectNode) {
            this.selectNode = this.node.getChildByName("Select");
        }
    }

    protected onEnable(): void {
        this.node.on(Button.EventType.CLICK, this.onClick, this);
    }

    protected onDisable(): void {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
    }

    public select(): void {
        if (this.group) {
            this.group.select(this);
            return;
        }

        this.setSelectedFromGroup(true);
    }

    public setGroup(group: UIToggleGroupLike | null): void {
        this.group = group;
    }

    public isSelected(): boolean {
        return this.selected;
    }

    public setSelectedFromGroup(selected: boolean): void {
        this.selected = selected;
        if (this.selectNode?.isValid) {
            this.selectNode.active = selected;
        }
    }

    private onClick(): void {
        this.select();
    }
}
