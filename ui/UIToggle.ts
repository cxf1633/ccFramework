import { _decorator, Button, Component, Node } from "cc";
import { UIToggleGroup } from "./UIToggleGroup";

const { ccclass, property, requireComponent } = _decorator;

@ccclass("UIToggle")
@requireComponent(Button)
export class UIToggle extends Component {
    @property(Node)
    public selectNode: Node | null = null;

    private group: UIToggleGroup | null = null;
    private selected = false;

    protected onLoad(): void {
        if (!this.selectNode) {
            this.selectNode = this.node.getChildByName("Select");
        }
    }

    protected onEnable(): void {
        this.node.on(Button.EventType.CLICK, this.onClick, this);
        this.group = this.findGroup();
        this.group?.register(this);
    }

    protected onDisable(): void {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
        this.group?.unregister(this);
        this.group = null;
    }

    public select(): void {
        if (!this.group) {
            this.group = this.findGroup();
        }
        if (this.group) {
            this.group.select(this);
            return;
        }

        this.setSelectedFromGroup(true);
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

    private findGroup(): UIToggleGroup | null {
        let parent = this.node.parent;
        while (parent) {
            const group = parent.getComponent(UIToggleGroup);
            if (group) {
                return group;
            }
            parent = parent.parent;
        }

        return null;
    }
}
