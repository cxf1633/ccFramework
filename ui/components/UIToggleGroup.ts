import { _decorator, Component, Layout, Node, Widget } from "cc";
import { UIToggle } from "./UIToggle";

const { ccclass, property } = _decorator;

/**
 * 每组可包含多个 Panel，用于支持一个 Toggle 对应多个 Panel 的场景（同一下标全显全隐）
 */
@ccclass("UITogglePanelGroup")
export class UITogglePanelGroup {
    @property({ type: [Node], tooltip: "该 Toggle 对应的 Panel 节点列表，选中时全部显示，取消时全部隐藏" })
    public panels: Node[] = [];
}

/**
 * 自定义 Panel 可见性映射，每个 Toggle 独立指定要显示的 Panel 列表
 * 适用于各 Toggle 之间 Panel 交叉显隐的复杂场景（如标签1显示AB，标签2显示BC）
 */
@ccclass("UITogglePanelMapping")
export class UITogglePanelMapping {
    @property({ type: [Node], tooltip: "选中该 Toggle 时需要显示的 Panel 节点列表，未在此列表中的 Panel 将被隐藏" })
    public visiblePanels: Node[] = [];
}

@ccclass("UIToggleGroup")
export class UIToggleGroup extends Component {
    @property([UIToggle])
    public toggles: UIToggle[] = [];

    @property({ type: [Node], tooltip: "Panel 节点列表，按下标与 Toggle 一一对应（一对一映射）" })
    public panels: Node[] = [];

    @property({ type: [UITogglePanelGroup], tooltip: "扩展 Panel 组，按下标与 Toggle 一一对应，选中时组内全部显示（一对多映射）" })
    public togglePanelGroups: UITogglePanelGroup[] = [];

    @property({ type: [UITogglePanelMapping], tooltip: "自定义 Panel 可见性映射，每个 Toggle 独立指定要显示的 Panel 列表（多对多映射）" })
    public togglePanelMappings: UITogglePanelMapping[] = [];

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

        // 处理原有的 panels（一对一映射）
        this.panels.forEach((panel, index) => {
            if (panel?.isValid) {
                panel.active = index === selectedIndex;
            }
        });

        // 处理 togglePanelGroups（一对多映射）
        this.togglePanelGroups.forEach((group, index) => {
            if (!group) return;
            const isActive = index === selectedIndex;
            group.panels.forEach((panel) => {
                if (panel?.isValid) {
                    panel.active = isActive;
                }
            });
        });

        // 处理 togglePanelMappings（自定义交叉映射）
        if (this.togglePanelMappings.length > 0) {
            this.refreshPanelMappings(selectedIndex);
        }
    }

    /**
     * 根据自定义映射刷新 Panel 可见性
     * 收集所有映射中引用的节点，选中映射中指定的显示，其余隐藏
     */
    private refreshPanelMappings(selectedIndex: number): void {
        // 收集所有映射引用的 Panel 节点
        const allMappedPanels = new Set<Node>();
        this.togglePanelMappings.forEach((mapping) => {
            if (!mapping) return;
            mapping.visiblePanels.forEach((panel) => {
                if (panel?.isValid) {
                    allMappedPanels.add(panel);
                }
            });
        });

        // 获取当前选中 Toggle 对应的映射
        const selectedMapping = selectedIndex >= 0 && selectedIndex < this.togglePanelMappings.length
            ? this.togglePanelMappings[selectedIndex]
            : null;

        const visibleSet = new Set<Node>(selectedMapping?.visiblePanels || []);

        // 统一设置所有被引用节点的可见性
        allMappedPanels.forEach((panel) => {
            if (panel?.isValid) {
                panel.active = visibleSet.has(panel);
            }
        });
    }
}
