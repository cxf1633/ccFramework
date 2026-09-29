import { _decorator, Component, Node, Toggle, EventHandler } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ToggleVisibility')
export class ToggleVisibility extends Component {

    @property({
        type: [Node],
        tooltip: "选中时显示，未选中时隐藏的节点列表"
    })
    public activeNodes: Node[] = [];

    @property({
        type: [Node],
        tooltip: "未选中时显示，选中时隐藏的节点列表"
    })
    public unactiveNodes: Node[] = [];

    @property({
        tooltip: "是否反向逻辑（选中时隐藏，未选中时显示）"
    })

    private _toggle: Toggle | null = null;

    onLoad() {
        this._toggle = this.getComponent(Toggle);
        if (!this._toggle) {
            console.error(this.node.name + "ToggleVisibility 脚本必须挂载在带有 Toggle 组件的节点上");
            return;
        }

        // 1. 初始化状态同步（防止编辑器里勾选了，但物体显示不对应）
        this.updateVisibility(this._toggle.isChecked);

        // 2. 代码绑定事件回调
        const eventHandler = new EventHandler();
        eventHandler.target = this.node;
        eventHandler.component = "ToggleVisibility";
        eventHandler.handler = "onToggleChanged";
        this._toggle.checkEvents.push(eventHandler);
    }

    /**
     * Toggle 事件回调
     * @param toggle 触发事件的组件
     */
    public onToggleChanged(toggle: Toggle) {
        this.updateVisibility(toggle.isChecked);
    }

    /**
     * 更新物体显示状态
     */
    private updateVisibility(isChecked: boolean) {
        // 根据选中状态和反向逻辑决定是否显示

        this.activeNodes.forEach(node => {
            if (node && node.isValid) {
                node.active = isChecked;
            }
        });

        this.unactiveNodes.forEach(node => {
            if (node && node.isValid) {
                node.active = !isChecked;
            }
        });
    }
}