import { _decorator, Component, Layout, Node, Widget } from "cc";
import { UIToggle } from "./UIToggle";

const { ccclass, property } = _decorator;

@ccclass("UIToggleGroup")
export class UIToggleGroup extends Component {
    @property([UIToggle])
    public toggles: UIToggle[] = [];

    @property([Node])
    public panels: Node[] = [];

    private selectedToggle: UIToggle | null = null;

    protected onLoad(): void {
        this.toggles.forEach((toggle) => toggle?.setGroup(this));
        const defaultToggle = this.toggles.find((toggle) => !!toggle);
        if (defaultToggle) {
            this.select(defaultToggle);
        }
    }

    protected onDestroy(): void {
        this.toggles.forEach((toggle) => {
            if (toggle?.isValid) {
                toggle.setGroup(null);
            }
        });
    }

    public select(toggle: UIToggle): void {
        if (this.toggles.indexOf(toggle) < 0) {
            return;
        }

        this.selectedToggle = toggle;
        this.toggles.forEach((item) => {
            item.setSelectedFromGroup(item === toggle);
        });
        this.refreshPanels();
    }

    public getSelected(): UIToggle | null {
        return this.selectedToggle;
    }

    /** 同步刷新 Toggle 根节点布局及选中背景的 Widget 对齐。 */
    public refreshLayout(): void {
        this.getComponent(Layout)?.updateLayout(true);
        this.toggles.forEach((toggle) => {
            toggle?.selectNode?.getComponent(Widget)?.updateAlignment();
        });
    }

    private refreshPanels(): void {
        const selectedIndex = this.selectedToggle
            ? this.toggles.indexOf(this.selectedToggle)
            : -1;

        this.panels.forEach((panel, index) => {
            if (panel?.isValid) {
                panel.active = index === selectedIndex;
            }
        });
    }
}
