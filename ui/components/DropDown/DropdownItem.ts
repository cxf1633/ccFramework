import {
    _decorator,
    Component,
    Label,
    Button,
    Node,
    Color,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('DropdownItem')
export class DropdownItem extends Component {

    @property({ type: Label, tooltip: '选项文字 Label 组件' })
    label: Label | null = null;

    @property({ type: Node, tooltip: '选中状态指示节点，当前项为选中项时自动显示' })
    selectNode: Node | null = null;

    @property({ type: Node, tooltip: '未选中状态指示节点，当前项不是选中项时自动显示' })
    unselectNode: Node | null = null;

    @property({ tooltip: '未选中时选项文字的颜色' })
    public unselectColor: Color = new Color(255, 255, 255, 255);

    @property({ tooltip: '选中时选项文字的颜色' })
    public selectColor: Color = new Color(255, 255, 255, 255);

    private _index: number = -1;
    private _value: string = '';
    private _onClick: ((index: number, value: string) => void) | null = null;

    /**
     * 初始化 Item
     */
    public init(
        index: number,
        value: string,
        onClick: (index: number, value: string) => void
    ) {
        this._index = index;
        this._value = value;
        this._onClick = onClick;

        if (this.label) {
            this.label.string = value;
        }

        const button = this.getComponent(Button);
        if (button && button.node) {
            button.node.off(Button.EventType.CLICK, this.onClick, this);
            button.node.on(Button.EventType.CLICK, this.onClick, this);
        }
    }

    /**
     * 设置是否为当前选中项：控制 selectNode / unselectNode 显隐，并切换文字颜色
     */
    public setSelected(selected: boolean): void {
        if (this.selectNode) {
            this.selectNode.active = selected;
        }
        if (this.unselectNode) {
            this.unselectNode.active = !selected;
        }

        this.updateLabelColor(selected);
    }

    /** 按选中状态刷新选项文字颜色 */
    private updateLabelColor(selected: boolean): void {
        if (!this.label) {
            return;
        }

        this.label.color = selected ? this.selectColor : this.unselectColor;
    }

    private onClick() {
        if (this._onClick) {
            this._onClick(this._index, this._value);
        }
    }

    protected onDestroy() {
        // 这里不能再走 this.getComponent(Button).node 来注销：
        // 节点销毁时引擎会按 _components 的顺序逐个销毁组件，而且销毁期间节点带着 Destroying 标记，
        // 组件不会从 _components 里移除，所以排在前面的 Button 往往已经被销毁过了 —— 它的 node 引用
        // 已被引擎置空（预览环境下 _destruct 会把对象属性清成 null），此时读 button.node.off 就会抛
        // "Cannot read properties of null (reading 'off')"。
        //
        // 而 getComponent(Button) 取到的 Button 必定和 DropdownItem 挂在同一个节点上（init 里就是在
        // 自身节点上取 Button 注册监听的），注销目标换成 this.node 完全等价，且不受 Button 已销毁影响。
        const node = this.node;

        if (node) {
            node.off(Button.EventType.CLICK, this.onClick, this);
        }

        this._onClick = null;
    }
}
