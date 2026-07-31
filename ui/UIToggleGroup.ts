import { _decorator, Component } from "cc";
import type { UIToggle } from "./UIToggle";

const { ccclass } = _decorator;

@ccclass("UIToggleGroup")
export class UIToggleGroup extends Component {
    private readonly toggles: UIToggle[] = [];
    private selectedToggle: UIToggle | null = null;

    public register(toggle: UIToggle): void {
        if (this.toggles.indexOf(toggle) >= 0) {
            return;
        }

        this.toggles.push(toggle);
        if (!this.selectedToggle) {
            this.select(toggle);
            return;
        }

        toggle.setSelectedFromGroup(false);
    }

    public unregister(toggle: UIToggle): void {
        const index = this.toggles.indexOf(toggle);
        if (index < 0) {
            return;
        }

        this.toggles.splice(index, 1);
        if (this.selectedToggle !== toggle) {
            return;
        }

        this.selectedToggle = null;
        const nextToggle = this.toggles.find((item) => item.node.activeInHierarchy);
        if (nextToggle) {
            this.select(nextToggle);
        }
    }

    public select(toggle: UIToggle): void {
        if (this.toggles.indexOf(toggle) < 0) {
            this.toggles.push(toggle);
        }

        this.selectedToggle = toggle;
        this.toggles.forEach((item) => {
            item.setSelectedFromGroup(item === toggle);
        });
    }

    public getSelected(): UIToggle | null {
        return this.selectedToggle;
    }
}
