import {
    _decorator,
    Component,
    Node,
    Label,
    Layout,
    Toggle,
    Canvas,
    EventTouch,
    NodeEventType,
    Rect,
    instantiate,
    js,
    UITransform,
    Vec3,
    Button,
} from 'cc';

import { DropdownItem } from './DropdownItem';
import { Logger } from '../../../log/Logger';

const { ccclass, property } = _decorator;

/** 展开位置 / 边界适配的定位日志标签，控制台按 [Dropdown] 过滤即可 */
const LOG_TAG = '[Dropdown]';

/**
 * 共享 List 的归属记录。
 *
 * 多个 Dropdown 可以共用同一个 List / content 节点，但同一时刻 content 里只应该装着
 * 「当前这个 Dropdown」的 Item。这两张表是唯一的共享状态，所以放在模块级：
 * - _contentOwners：content 里现在放的是谁的 Item（展开时据此判断要不要重建）
 * - _listOwners：现在展开的是谁（toggle 该开还是该关、并据此关掉上一个）
 * 用 WeakMap 以节点为 key，节点销毁后记录自动释放。
 */
const _contentOwners = new WeakMap<Node, Dropdown>();
const _listOwners = new WeakMap<Node, Dropdown>();

@ccclass('DropdownOption')
export class DropdownOption {
    @property({ type: String, tooltip: '选项的显示文字，展示在下拉列表和主标签上' })
    public label: string = '';

    @property({ type: String, tooltip: '选项的实际值，选中后通过 getSelectedValue() 或回调返回' })
    public value: string = '';
}

@ccclass('Dropdown')
export class Dropdown extends Component {

    // ============================================================
    // Inspector
    // ============================================================

    @property({ type: Label, tooltip: '下拉框主按钮上的 Label 组件，用于显示当前选中的选项文字' })
    public label: Label | null = null;

    @property({ type: Node, tooltip: '下拉列表的根节点，切换下拉时会控制其 active 属性来显示/隐藏' })
    public list: Node | null = null;

    @property({ type: Node, tooltip: '列表项内容的父节点，动态生成的选项 Item 会添加到此节点下' })
    public content: Node | null = null;

    @property({ type: Node, tooltip: '列表项模板（支持从层级拖入节点，或从资源拖入预制体，运行时克隆使用）' })
    public itemPrefab: Node | null = null;

    @property({ type: Node, tooltip: '分割线节点模板，插入到相邻两个选项之间（首尾不加）；不设置则不生成分割线，节点高度即分割线厚度' })
    public dividerPrefab: Node | null = null;

    @property({ type: DropdownOption, tooltip: '下拉选项数组，每个选项包含 label（显示文字）和 value（实际值）' })
    public options: DropdownOption[] = [];

    @property({ type: Number, tooltip: '初始化时默认选中的选项索引（从 0 开始）' })
    public defaultIndex: number = 0;

    @property({ type: Toggle, tooltip: '（可选）控制展开状态的 Toggle，不填时自动取 Dropdown 节点上的 Toggle；它的 isChecked 会被同步成「列表是否展开」，箭头显示跟着它走即可' })
    public toggleComp: Toggle | null = null;

    @property({ type: Boolean, tooltip: '节点上没有 Toggle 时，是否由 Dropdown 自己监听点击来展开/收起列表；有 Toggle 时点击一律交给 Toggle，列表跟随它的状态' })
    public toggleOnClick: boolean = true;

    @property({ type: Number, tooltip: '下拉列表顶边与 Dropdown 节点底边之间的间距，单位是 List 的局部坐标（跟节点位置栏里的数值同一把尺）：展开时先按世界坐标把 List 顶边对齐到 Dropdown 节点最底部，再在局部坐标里往下偏移 listGap；父节点有缩放时它会跟着缩放' })
    public listGap: number = 10;

    // ============================================================
    // 内部数据
    // ============================================================

    private _selectedIndex: number = -1;

    private _selectedValue: string = '';

    /** 当前生成的所有列表项 DropdownItem 组件引用 */
    private _items: DropdownItem[] = [];

    /** 列表项待刷新标记：options 变化后置脏，下次展开下拉（open）时才真正重建 */
    private _itemsDirty: boolean = true;

    /** 上次成功生成列表项时用的 options 数组（引用比较，用于识别外部直接换掉了 options） */
    private _builtOptions: DropdownOption[] | null = null;

    /** content 节点上的纵向 Layout 组件缓存 */
    private _contentLayout: Layout | null = null;

    /** 展开状态用的 Toggle */
    private _toggle: Toggle | null = null;

    private _toggleResolved: boolean = false;

    /** 是否正在由 list 状态同步 Toggle（避免 TOGGLE 事件又反过来切一次） */
    private _syncingToggle: boolean = false;

    private _onValueChanged:
        ((index: number, value: string) => void) | null = null;

    // ============================================================
    // 生命周期
    // ============================================================

    protected onLoad() {

        this.updateLabel();

        this.disableTemplateInput();

        this.close();
    }

    protected onEnable() {
        this.registerClickEvent();
        this.registerToggleEvent();
        this.watchListActive();
    }

    protected onDisable() {
        this.unregisterClickEvent();
        this.unregisterToggleEvent();
        this.unwatchListActive();
    }

    // ============================================================
    // 初始化
    // ============================================================

    protected start() {
        // 这里只确定「选中项 + 主按钮文字」，不再生成列表项：
        // list 一直是收起状态，Item 节点推迟到真正展开下拉时（open -> ensureItems）再按 options 生成
        this.initSelection();
    }

    /**
     * 初始化选中项：把 defaultIndex 落到 _selectedIndex / _selectedValue 上，并刷新主按钮文字。
     * 不涉及列表项节点，所以列表还没展开时也能正确显示当前选项。
     */
    private initSelection(): void {
        if (this.options.length === 0) {
            this._selectedIndex = -1;
            this._selectedValue = '';
            this.updateLabel();

            return;
        }

        let index = this.defaultIndex;

        if (index < 0 || index >= this.options.length) {
            index = 0;
        }

        this.select(index, false);
    }

    // ============================================================
    // 点击 Dropdown
    // ============================================================

    public toggle() {
        if (!this.list) {
            return;
        }

        // 判断依据是「现在展开的是不是我」，不能只看 list.active：
        // List 被多个 Dropdown 共用时那是共享状态，别人开着的时候它也是 true，
        // 用 list.active 判断会导致「点第二个 Dropdown 反而把列表关了」
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    }

    public open() {
        const list = this.list;

        if (!list) {
            return;
        }

        // List 可能是多个 Dropdown 共用的：先把上一个展开它的关掉，
        // 否则它的展开状态（箭头 / 勾选）会一直停在「展开」，跟 List 的实际归属对不上
        const previous = _listOwners.get(list);

        if (previous && previous !== this) {
            previous.close();
        }

        list.active = true;
        _listOwners.set(list, this);

        this.logLayout(`open 开始 list=${list.name} 已生成Item=${this._items.length}`);

        // 展开时才生成/刷新列表项：content 里装的是别人的 Item 时会重建（数据没变就是空操作）
        this.ensureItems();

        // List 只是个背景图节点：先按 Item 的尺寸打底（宽度自动跟随 Item）
        this.fitListToItem();

        this.ensureContentLayout();

        // 再按实际生成出来的子节点算一遍面板尺寸：不能只指望 Layout 的 CONTAINER 自适应
        // （它没生效时 List 会一直停在一个 Item 的大小，后面的边界判断就全废了）
        this.fitListToContent();

        // 用最终尺寸排一次子节点，保证同一帧里 Item 就已经排好，不会先闪一下重叠
        this.refreshContentLayout();

        // 尺寸排好后，把 List 摆到「当前 Dropdown 节点最底部往下 listGap」：
        // 先世界坐标对齐边缘，再按局部坐标下移 listGap；顺便翻方向 / 贴界面边界
        this.layoutListPosition();

        this.refreshItemStates();

        this.syncToggleState();
    }

    public close() {
        const list = this.list;

        if (!list) {
            return;
        }

        // List 共用时，别人正开着就别去关它
        // （例如别的 Dropdown 在 onLoad 里做的「初始收起」兜底）
        const owner = _listOwners.get(list);

        if (owner && owner !== this) {
            return;
        }

        list.active = false;
        _listOwners.delete(list);

        this.syncToggleState();
    }

    /**
     * 当前展开的是不是自己。
     * List 共用时 list.active 只说明「有个列表开着」，所以还要看归属表；
     * 没有人认领（例如 List 在预制体里本来就是 active）时按「不是我」处理，
     * 这样点一下会正常展开自己的选项，而不是先把共享的列表关掉。
     */
    public isOpen(): boolean {
        const list = this.list;

        return !!list?.active && _listOwners.get(list) === this;
    }

    // ============================================================
    // List 激活时机
    // ============================================================

    /**
     * 盯住 List 的「在层级中激活」变化。
     *
     * 实测：点开下拉的那一刻，List 的父节点（遮罩面板 btn_ListMaskPanel）还是 inactive，
     * 于是 List 的 activeInHierarchy 也是 false —— Layout 不跑、世界坐标也还要等面板摆好才定下来。
     * 所以面板真正激活时补做一次「按子节点定尺寸 → 排子节点 → 摆位 + 翻方向 + 贴边界」。
     */
    private watchListActive(): void {
        this.list?.on(NodeEventType.ACTIVE_IN_HIERARCHY_CHANGED, this.onListActiveChanged, this);
    }

    private unwatchListActive(): void {
        if (this.list) {
            this.list.off(NodeEventType.ACTIVE_IN_HIERARCHY_CHANGED, this.onListActiveChanged, this);
        }
    }

    private onListActiveChanged(): void {
        // 收起 / 别人展开时不用管
        if (!this.list?.activeInHierarchy || !this.isOpen()) {
            return;
        }

        this.fitListToContent();
        this.refreshContentLayout();
        this.layoutListPosition();
    }

    // ============================================================
    // List 尺寸
    // ============================================================

    /**
     * 用 Item 的尺寸给 List 打底，List 节点上只需要摆一张背景图，不用手工去对尺寸：
     * - 宽度：直接取 Item 的宽度，改 Item 模板 List 就自动跟着变；
     * - 高度：先设成一个 Item 的高度，紧接着由 content 上的纵向 Layout（CONTAINER）
     *   撑开到「所有 Item + 分割线」的总高，所以最终大小就是整列 Item 的大小。
     * 尺寸优先取已经生成出来的 Item 克隆体，没有时退回 Item 模板。
     */
    private fitListToItem(): void {
        const listTransform = this.list?.getComponent(UITransform);

        if (!listTransform) {
            return;
        }

        const source: unknown = this._items.length > 0
            ? this._items[0].node
            : this.itemPrefab;

        // itemPrefab 支持直接拖预制体资源，那种情况取不到节点，跳过
        if (!(source instanceof Node)) {
            return;
        }

        const itemTransform = source.getComponent(UITransform);

        if (!itemTransform) {
            return;
        }

        listTransform.setContentSize(itemTransform.contentSize);
    }

    /**
     * 按 content 里实际生成出来的子节点，重新算一遍面板尺寸（宽 = 最宽的子节点，高 = 子节点高度和 + 间距 + 内边距）。
     *
     * 为什么不直接依赖 content 上那个 Layout 的 CONTAINER 自适应：
     * 那个结果取决于 Layout 是否 enabled / enabledInHierarchy、resizeMode 有没有被改成别的，
     * 只要有一条不满足，List 就会一直停在「一个 Item 的大小」。实测就是这样：
     * 8 个 Item、List 还是 150x60 —— List 尺寸不对，后面「有没有超出屏幕、要不要翻到上方」的判断就全部失效。
     * 这里自己累加，跟 Layout 的配置解耦。
     *
     * List 和 content 不是同一个节点时两边都写一遍：List 是背景，尺寸要跟内容一致，
     * Layout 在 content 上算出来的容器大小也才不会和背景对不上。
     */
    private fitListToContent(): void {
        const list = this.list;

        if (!list) {
            return;
        }

        const listTransform = list.getComponent(UITransform);
        const content = this.content ?? list;
        const contentTransform = content.getComponent(UITransform);

        if (!listTransform || !contentTransform) {
            return;
        }

        const children = content.children;

        let width = 0;
        let height = 0;
        let count = 0;

        for (let i = 0; i < children.length; i++) {
            const child = children[i];

            // 这里只认子节点自己的 active，不用 activeInHierarchy：
            // List 展开的那一刻外层遮罩面板可能还没激活（日志实测就是 Layout inHierarchy=false），
            // 用 activeInHierarchy 会一个子节点都数不到 → 尺寸算不出来 → 摆位/翻方向全落回 150x60 的错误判断。
            // contentSize 是节点自身的静态数据，节点没激活也读得到，所以直接按尺寸累加即可。
            if (!child.active) {
                continue;
            }
            const childTransform = child.getComponent(UITransform);

            if (!childTransform) {
                continue;
            }

            width = Math.max(width, childTransform.width);
            height += childTransform.height;
            count++;
        }

        // 一个子节点都没有（还没生成 Item）时保留 fitListToItem 打的基础尺寸
        if (count === 0) {
            return;
        }

        const layout = this._contentLayout;
        const spacingY = layout ? layout.spacingY : 0;
        const paddingV = layout ? layout.paddingTop + layout.paddingBottom : 0;
        const paddingH = layout ? layout.paddingLeft + layout.paddingRight : 0;

        const finalWidth = width + paddingH;
        const finalHeight = height + spacingY * (count - 1) + paddingV;

        listTransform.setContentSize(finalWidth, finalHeight);

        if (content !== list) {
            contentTransform.setContentSize(finalWidth, finalHeight);
        }
    }

    // ============================================================
    // 没有 Toggle 时的点击兜底
    // ============================================================

    /**
     * 在 Dropdown 节点上监听点击，节点上没挂 Toggle 时由组件自己控制 list 的显隐。
     *
     * 用捕获阶段（useCapture = true）注册：只要有子节点（比如模板上的 Button）先命中触摸，
     * 引擎就让它独占这次触摸（命中后直接 break），父节点的普通监听连 TOUCH_START 都收不到，
     * 捕获阶段则在子节点之前触发，拦不住。
     */
    private registerClickEvent(): void {
        if (!this.toggleOnClick) {
            return;
        }

        this.node.on(NodeEventType.TOUCH_END, this.onNodeTouchEnd, this, true);
    }

    private unregisterClickEvent(): void {
        this.node.off(NodeEventType.TOUCH_END, this.onNodeTouchEnd, this, true);
    }

    /** 触摸抬起：不在 list 内部、且节点上没有 Toggle 时，才由自己切换 list 的显隐 */
    private onNodeTouchEnd(event: EventTouch): void {
        if (this.isInList(event.target as Node | null)) {
            return;
        }

        // 有 Toggle 时点击交给 Toggle 自己处理：它会翻 isChecked 并触发 checkEvents（箭头显示）、CLICK（点击音效），
        // list 通过 TOGGLE 事件跟随。这里再切一次的话两边会互相抵消，等于点了没反应。
        if (this.getToggle()) {
            return;
        }

        this.toggle();
    }

    /** 节点是否就是 list 或 list 的子节点 */
    private isInList(node: Node | null): boolean {
        if (!node || !this.list) {
            return false;
        }

        return node === this.list || node.isChildOf(this.list);
    }

    // ============================================================
    // Toggle（展开状态 / 箭头显示）
    // ============================================================

    /** 取展开状态用的 Toggle：优先 Inspector 上指定的，没指定就取 Dropdown 自己节点上的 */
    private getToggle(): Toggle | null {
        if (!this._toggleResolved) {
            this._toggleResolved = true;
            this._toggle = this.toggleComp ?? this.node.getComponent(Toggle);
        }

        return this._toggle;
    }

    private registerToggleEvent(): void {
        const toggle = this.getToggle();

        if (toggle) {
            toggle.node.on(Toggle.EventType.TOGGLE, this.onToggleChanged, this);
        }
    }

    private unregisterToggleEvent(): void {
        const toggle = this.getToggle();

        // toggle.node 可能已经是 null：节点销毁时组件按 _components 顺序销毁，Toggle 若排在
        // Dropdown 前面会先被销毁，其 node 引用被引擎置空（_destruct），这里不判空就会抛
        // "Cannot read properties of null (reading 'off')"。
        if (toggle && toggle.node) {
            toggle.node.off(Toggle.EventType.TOGGLE, this.onToggleChanged, this);
        }
    }

    /** Toggle 状态变化（点击 / 代码赋值 / ToggleContainer）：list 跟着展开收起 */
    private onToggleChanged(toggle: Toggle): void {
        if (this._syncingToggle) {
            return;
        }

        if (toggle.isChecked) {
            this.open();
        } else {
            this.close();
        }
    }

    /**
     * 把 Toggle 的勾选状态同步成「list 是否展开」。
     * 走的是 Toggle 自己的 setter，所以 checkMark 显隐和 checkEvents 回调
     * （例如 ToggleVisibility 切箭头）都会正常触发。
     */
    private syncToggleState(): void {
        const toggle = this.getToggle();

        if (!toggle || this._syncingToggle) {
            return;
        }

        const isOpen = this.isOpen();

        if (toggle.isChecked === isOpen) {
            return;
        }

        this._syncingToggle = true;
        toggle.isChecked = isOpen;
        this._syncingToggle = false;
    }

    // ============================================================
    // 模板节点
    // ============================================================

    /**
     * Item / 分割线模板挂在 Dropdown 按钮上，模板要一直显示（按钮里要展示选中项的样式），
     * 但它身上的 Button 会先命中并独占这次触摸，导致 Dropdown 自己的 Toggle / Button 收不到点击。
     *
     * 所以这里不禁用显示，只把模板上的 Button 功能关掉（enabled = false）：
     * Button 的触摸监听是在 onEnable 里注册、onDisable 里注销的，关掉之后模板节点就不会再抢触摸，
     * 触摸会正常落到 Dropdown 节点上，Toggle 的 isChecked / checkEvents（箭头）和 CLICK（点击音效）都能收到。
     *
     * 只处理挂在 Dropdown 节点下面的模板，模板放在别处（或直接用预制体资源）时不动它。
     * 注意：克隆体会把模板上被关掉的 Button 一起复制过去，所以 setOptions 里要调 restoreInput 打开。
     */
    private disableTemplateInput(): void {
        this.disableInputOf(this.itemPrefab);
        this.disableInputOf(this.dividerPrefab);
    }

    private disableInputOf(template: Node | null): void {
        if (!template || template === this.node || !template.isChildOf(this.node)) {
            return;
        }

        const buttons: Button[] = [];
        this.collectButtons(template, buttons);

        for (let i = 0; i < buttons.length; i++) {
            buttons[i].enabled = false;
        }
    }

    /** 还原克隆体上的 Button：模板上的 Button 是被我们关掉的，实例上要打开 */
    private restoreInput(node: Node): void {
        const buttons: Button[] = [];
        this.collectButtons(node, buttons);

        for (let i = 0; i < buttons.length; i++) {
            buttons[i].enabled = true;
        }
    }

    /**
     * 收集节点自身及所有子孙上的 Button。
     * 这里自己遍历而不是用 getComponentsInChildren(Button)：UIButton / Toggle 是 Button 的子类，
     * 而引擎的 getComponentsInChildren 对 sealed 过的类只做精确类型匹配，自己用 instanceof 判断更稳。
     */
    private collectButtons(node: Node, result: Button[]): void {
        const components = node.components;

        for (let i = 0; i < components.length; i++) {
            const component = components[i];

            if (component instanceof Button) {
                result.push(component);
            }
        }

        const children = node.children;

        for (let i = 0; i < children.length; i++) {
            this.collectButtons(children[i], result);
        }
    }

    // ============================================================
    // 设置选项（只登记数据，Item 懒生成）
    // ============================================================

    /**
     * 设置选项数据。
     *
     * 这里只登记数据并把列表标记成「待刷新」，不会马上生成 Item：
     * 列表项统一推迟到展开下拉时（open -> ensureItems）按最新数据生成，
     * 免得界面还在 start 阶段、下拉压根没用过就把整列 Item 建出来。
     * 参考：原先 start() 里直接调 setOptions，会在界面初始化时立刻建一遍列表。
     */
    public setOptions(options: DropdownOption[]) {
        this.options = options;

        this.refreshList();
    }

    /**
     * 标记列表待刷新；若列表此刻正展开着则立即重建，保证看到的就是最新数据。
     * 外部直接改了 options 数组里的元素（没走 setOptions）时也可以主动调一下。
     */
    public refreshList(): void {
        this._itemsDirty = true;

        // 收起状态（含 start 阶段还没生成过）只置脏，等下次展开时统一生成/刷新；
        // 正展开着才立刻重建，否则用户会对着旧列表点选
        if (this._builtOptions !== null && this.isOpen()) {
            this.rebuildItems();
        }
    }

    // ============================================================
    // 列表项懒生成 / 刷新
    // ============================================================

    /** 展开列表前调用：content 里装的是别人的 Item、或自己的数据变过时，重建 Item */
    private ensureItems(): void {
        const content = this.content;

        if (!content) {
            return;
        }

        // 共用的 content 会被别的 Dropdown 抢先重建，这时里面放的是它们的 Item，
        // 数量 / 文字 / 点击绑定全是别人的 —— 必须重建，
        // 否则就会出现「展开了却是上一个下拉的选项」
        const ownedByOther = _contentOwners.get(content) !== this;

        if (ownedByOther || this._itemsDirty || this._builtOptions !== this.options) {
            this.rebuildItems();
        }
    }

    /** 按当前 options 重建列表：清空 content -> 克隆 Item / 分割线 -> 重排 -> 同步选中态 */
    private rebuildItems(): void {
        const content = this.content;

        // content 如果是共用的，之前可能装着别的 Dropdown 的 Item：
        // 先把对方「列表已生成」的状态作废（它持有的 _items 马上会被销毁），
        // 否则它下次展开会以为自己还是这里的主人，跳过重建继续显示别人的选项
        const owner = content ? _contentOwners.get(content) : undefined;

        if (owner && owner !== this) {
            owner.invalidateItems();
        }

        this.clearItems();

        // 没有 content / itemPrefab 时建不出列表：保留脏标记，等配置补上后下次展开再试
        if (!content || !this.itemPrefab) {
            return;
        }

        this._itemsDirty = false;
        this._builtOptions = this.options;

        _contentOwners.set(content, this);

        this.ensureContentLayout();

        for (let i = 0; i < this.options.length; i++) {
            const itemNode = instantiate(this.itemPrefab);

            itemNode.parent = content;
            itemNode.active = true;

            // 模板上的 Button 在 disableTemplateInput 里被关掉了，克隆体会一起复制过来，这里打开
            this.restoreInput(itemNode);

            const item = itemNode.getComponent(DropdownItem);

            if (!item) {
                console.warn(
                    '[Dropdown] Item Prefab 上没有 DropdownItem 组件'
                );
                continue;
            }

            item.init(
                i,
                this.options[i].label,
                this.onItemClick.bind(this)
            );

            this._items.push(item);

            // 相邻两项之间插入分割线，首尾不加
            if (i < this.options.length - 1) {
                this.createDivider();
            }
        }

        // 数量变了 List 高矮就变了：先重算面板尺寸，再用最终尺寸排一次子节点
        this.fitListToContent();
        this.refreshContentLayout();

        // 重新生成过 Item，选中状态（selectNode / 文字颜色）要跟着当前选中项刷一遍
        this.refreshItemStates();

        // 最后重新摆一次位置并重新贴界面边界
        this.layoutListPosition();
    }

    /**
     * 把「列表已生成」的状态作废。
     * 共用的 content 被别的 Dropdown 抢走时由对方调用：自己持有的 _items 马上就会变成
     * 被摘下来的游离节点，必须丢掉，并且下次展开要重新生成。
     */
    private invalidateItems(): void {
        // 兜底：实例可能已经被销毁过（预览环境下引擎会把对象属性清成 null，_items 也会变 null），
        // 这时只要把状态置脏即可，别再碰 _items
        if (this._items) {
            this._items.length = 0;
        }

        this._builtOptions = null;
        this._itemsDirty = true;
    }

    // ============================================================
    // List 摆放
    // ============================================================

    /**
     * 取「节点自身 UITransform 框」上某一点的世界坐标。
     * ratioX / ratioY 是框内的比例：0 = 左/下边，0.5 = 中间，1 = 右/上边。
     *
     * 注意不能用 UITransform.getBoundingBoxToWorld()：那个 API 会把「自身 + 所有 active 子节点」
     * 的框 union 到一起（引擎实现里对 children 逐个 Rect.union），Dropdown 节点下挂着
     * item 模板、listAnchorPoint 这类子节点时，量出来的「底边」会比节点真正的底边低一大截。
     * 这里直接按锚点算自身框上的点，再用世界矩阵转出去，不牵扯任何子节点。
     */
    private getSelfBoxWorldPoint(
        transform: UITransform,
        ratioX: number,
        ratioY: number
    ): Vec3 {
        const size = transform.contentSize;
        const anchor = transform.anchorPoint;

        // 锚点相对坐标：节点位置就在锚点处，所以 (0.5 - anchor) 即「框内某个比例点」相对锚点的偏移
        return transform.convertToWorldSpaceAR(
            new Vec3(
                (ratioX - anchor.x) * size.width,
                (ratioY - anchor.y) * size.height,
                0
            )
        );
    }

    /**
     * 把 List 摆到「当前 Dropdown 节点最底部再往下 listGap」的位置，水平按 Dropdown 居中对齐。
     *
     * 分两步，两步的坐标系不一样，别混：
     * 1) 世界坐标对齐：取「Dropdown 自身框的底边中点」当目标点、取「List 自身框的顶边中点」当参照点，
     *    两个世界坐标点都换算到 List 父节点的局部坐标里求差值再平移。
     *    对齐结果只取决于世界坐标，所以 List 挂在哪个父节点下、Dropdown 嵌套多深、父级有没有缩放都不影响，
     *    List / Dropdown 自己的锚点是什么也都能摆对。
     * 2) 局部坐标偏移：对齐好之后再按 List 自己的局部坐标往下挪 listGap。
     *    listGap 是局部值（跟节点位置栏里的数值同一把尺），父节点带缩放时它跟着一起缩放，
     *    不会变成「另一段世界距离」。
     *
     * 多个 Dropdown 共用同一个 List 时，每展开哪个就摆到哪个下面。
     *
     * 方向选择：默认摆在下方；下方放不下（List 底边越过界面下边界）就翻到上方，
     * 上方也放不下（List 比可用空间还高）才退回下方，交给 clampListIntoView 贴住边界。
     */
    private layoutListPosition(): void {
        const list = this.list;

        if (!list) {
            this.logLayout('摆放跳过：没有配 List');
            return;
        }

        const parent = list.parent;
        const parentTransform = parent?.getComponent(UITransform);

        if (!parentTransform) {
            this.logLayout(`摆放跳过：List 的父节点 ${parent ? parent.name : '<无父节点>'} 上没有 UITransform`);
            return;
        }

        const dropdownTransform = this.node.getComponent(UITransform);
        const listTransform = list.getComponent(UITransform);

        if (!dropdownTransform || !listTransform) {
            this.logLayout('摆放跳过：Dropdown 或 List 上没有 UITransform');
            return;
        }

        const boundary = this.getVisibleWorldRect();
        const beforeY = list.position.y;
        const content = this.content ?? list;
        const contentTransform = content.getComponent(UITransform);
        const layout = this._contentLayout;

        // 第 1 步：默认摆下方
        this.placeListBeside(true, dropdownTransform, listTransform, parentTransform);

        // 第 2 步：下方碰到界面下边界就翻到上方
        let placedAbove = false;

        if (boundary && this.getListBoxWorldY(listTransform, false) < boundary.yMin) {
            this.placeListBeside(false, dropdownTransform, listTransform, parentTransform);
            placedAbove = true;

            // 上方也超出上边界（List 比可用高度还高）就退回下方，由最后一步贴边界收尾
            if (this.getListBoxWorldY(listTransform, true) > boundary.yMax) {
                this.placeListBeside(true, dropdownTransform, listTransform, parentTransform);
                placedAbove = false;
            }
        }

        // 第 3 步：兜底，任何一边探出边界都整体挪回来
        const corrected = this.clampListIntoView();

        this.logLayout(
            `摆放完成 方向=${placedAbove ? '上方' : '下方'}`
            + ` List尺寸=${listTransform.width}x${listTransform.height.toFixed(0)}`
            + ` List本地Y=${beforeY.toFixed(1)}→${list.position.y.toFixed(1)}`
            + ` List世界Y=[${this.getListBoxWorldY(listTransform, false).toFixed(1)}, ${this.getListBoxWorldY(listTransform, true).toFixed(1)}]`
            + ` 边界Y=${boundary ? `[${boundary.yMin.toFixed(1)}, ${boundary.yMax.toFixed(1)}]` : '未找到 Canvas（不做边界适配）'}`
            + ` 边界修正=${corrected ? `(${corrected.x.toFixed(1)}, ${corrected.y.toFixed(1)})` : '未执行'}`
            + ` | content=${content.name}${content === list ? '(=List)' : content.isChildOf(list) ? '(在List下)' : '(不在List下!)'}`
            + ` content尺寸=${contentTransform ? `${contentTransform.width}x${contentTransform.height.toFixed(0)}` : '无UITransform'}`
            + ` content子节点=${content.children.length} List子节点=${list.children.length}`
            + ` Layout=${layout ? `在${layout.node.name} type=${layout.type} resize=${layout.resizeMode} enabled=${layout.enabled} inHierarchy=${layout.enabledInHierarchy}` : '无（未挂上）'}`
            + ` | List组件=[${this.getComponentNames(list)}]`
            + ` 父节点=${parent.name} 父组件=[${this.getComponentNames(parent)}]`
        );
    }

    /** 打印一行定位日志（排查「展开后位置没变 / 没贴边界」时用，定位完可以整体删掉） */
    private logLayout(message: string): void {
        Logger.log(`${LOG_TAG}[${this.node.name}] ${message}`);
    }

    /** 列节点上的组件名：用来一眼看出是谁把位置改回去了（父节点上的 Layout 会重排子节点、Widget 会按对齐重排自己） */
    private getComponentNames(node: Node | null): string {
        if (!node) {
            return '<无>';
        }

        const names: string[] = [];
        const components = node.components;

        for (let i = 0; i < components.length; i++) {
            names.push(js.getClassName(components[i]));
        }

        return names.length > 0 ? names.join(',') : '<无>';
    }

    /**
     * 把 List 贴到 Dropdown 的边上。
     *
     * below = true ：List 顶边中点在世界坐标下对齐 Dropdown 底边中点，再在父节点局部坐标里往下让 listGap；
     * below = false：List 底边中点对齐 Dropdown 顶边中点，再往上让 listGap。
     *
     * 分两步是为了分开坐标系：对齐只认世界坐标，所以 List 挂在哪个父节点下、Dropdown 嵌套多深、
     * 父级有没有缩放都不影响，两边的锚点是什么也都能摆对；listGap 则用局部坐标，
     * 父节点带缩放时它跟着一起缩放，不会变成「另一段世界距离」。
     */
    private placeListBeside(
        below: boolean,
        dropdownTransform: UITransform,
        listTransform: UITransform,
        parentTransform: UITransform
    ): void {
        const list = this.list;

        if (!list) {
            return;
        }

        // convertToWorldSpaceAR / convertToNodeSpaceAR 内部会先 updateWorldTransform，不会读到旧矩阵
        const targetWorld = this.getSelfBoxWorldPoint(dropdownTransform, 0.5, below ? 0 : 1);
        const anchorWorld = this.getSelfBoxWorldPoint(listTransform, 0.5, below ? 1 : 0);

        const target = parentTransform.convertToNodeSpaceAR(targetWorld);
        const current = parentTransform.convertToNodeSpaceAR(anchorWorld);

        const localPos = list.position;
        const gap = below ? -this.listGap : this.listGap;

        list.setPosition(
            localPos.x + (target.x - current.x),
            localPos.y + (target.y - current.y) + gap,
            localPos.z
        );
    }

    /** List 自身框在世界坐标下的上边界（top = true）或下边界（top = false） */
    private getListBoxWorldY(transform: UITransform, top: boolean): number {
        return this.getSelfBoxWorldPoint(transform, 0.5, top ? 1 : 0).y;
    }

    /**
     * 把 List 挪进界面可见范围内。
     *
     * 一般是「按钮靠近屏幕底部 + 选项多」时 List 往下溢出，这里把整块 List 往上顶回来；
     * 左右超出同理。List 比整个界面还高时以顶边为准（先保证第一个选项可见），
     * 剩下的部分从底部溢出。
     * 每次摆放都是从锚点位置重新算增量，所以反复调用不会越挪越远。
     *
     * @returns 实际施加的世界坐标位移；没能执行（缺节点 / 找不到边界）时返回 null
     */
    private clampListIntoView(): Vec3 | null {
        const list = this.list;
        const listTransform = list?.getComponent(UITransform);
        const parentTransform = list?.parent?.getComponent(UITransform);

        if (!list || !listTransform || !parentTransform) {
            this.logLayout('边界适配跳过：List / 父节点缺少 UITransform');
            return null;
        }

        const boundary = this.getVisibleWorldRect();

        if (!boundary) {
            this.logLayout('边界适配跳过：往上和整个场景都没找到 Canvas，量不出可见范围');
            return null;
        }

        // List 自身框在世界坐标下的两个角（只算自己，不含子节点）
        const min = this.getSelfBoxWorldPoint(listTransform, 0, 0);
        const max = this.getSelfBoxWorldPoint(listTransform, 1, 1);

        const deltaX = this.getOverflowDelta(min.x, max.x, boundary.xMin, boundary.xMax);
        const deltaY = this.getOverflowDelta(min.y, max.y, boundary.yMin, boundary.yMax);

        if (deltaX === 0 && deltaY === 0) {
            return Vec3.ZERO;
        }

        // 世界坐标下的位移换算到父节点局部坐标里应用（父节点带缩放时才对得上）
        const originWorld = listTransform.convertToWorldSpaceAR(Vec3.ZERO);
        const shiftedWorld = new Vec3(
            originWorld.x + deltaX,
            originWorld.y + deltaY,
            originWorld.z
        );

        const from = parentTransform.convertToNodeSpaceAR(originWorld);
        const to = parentTransform.convertToNodeSpaceAR(shiftedWorld);

        const localPos = list.position;

        list.setPosition(
            localPos.x + (to.x - from.x),
            localPos.y + (to.y - from.y),
            localPos.z
        );

        return new Vec3(deltaX, deltaY, 0);
    }

    /**
     * 单个轴向上需要挪多少：超出边界就整体挪回来。
     * 尺寸比边界还大时 max 那条优先，也就是顶边 / 右边对齐边界。
     */
    private getOverflowDelta(
        min: number,
        max: number,
        boundMin: number,
        boundMax: number
    ): number {
        if (max > boundMax) {
            return boundMax - max;
        }

        if (min < boundMin) {
            return boundMin - min;
        }

        return 0;
    }

    /**
     * 取界面可见范围（Canvas 自己的框）在世界坐标下的矩形。
     *
     * 同样是只算 Canvas 自身的框，不用 getBoundingBoxToWorld：
     * 那个 API 会把所有 active 子节点 union 进来，界面上只要有元素探出屏幕，
     * 量出来的边界就会比真实可见范围大一截（理由同 getSelfBoxWorldPoint）。
     * 找不到 Canvas 时返回 null，跳过边界适配。
     */
    private getVisibleWorldRect(): Rect | null {
        const canvasNode = this.findCanvasNode();

        if (!canvasNode) {
            return null;
        }

        const transform = canvasNode.getComponent(UITransform);

        if (!transform) {
            return null;
        }

        const min = this.getSelfBoxWorldPoint(transform, 0, 0);
        const max = this.getSelfBoxWorldPoint(transform, 1, 1);

        return new Rect(min.x, min.y, max.x - min.x, max.y - min.y);
    }

    /**
     * 找 Canvas 节点：先沿 List 往上找（常规情况），找不到再在整个场景里找一遍。
     *
     * 加场景兜底是因为只往上找有个坑：List 一旦挂在 Canvas 之外（比如拖成了别的 UI 根节点
     * 下的节点，或者根节点本身不在 Canvas 下面），就会判定成「没有边界」，
     * 表现出来正是「超出了屏幕却一动不动」。
     */
    private findCanvasNode(): Node | null {
        let node: Node | null = this.list;

        while (node) {
            if (node.getComponent(Canvas)) {
                return node;
            }

            node = node.parent;
        }

        const scene = this.node.scene;
        const canvas = scene ? scene.getComponentInChildren(Canvas) : null;

        return canvas ? canvas.node : null;
    }

    // ============================================================
    // 分割线
    // ============================================================

    /**
     * 克隆一条分割线挂到 content 末尾。
     * 因为 Item 是按顺序生成的，直接 append 就能落在「上一个 Item 与下一个 Item」之间。
     * 没有配置分割线模板时什么也不做。
     */
    private createDivider(): void {
        if (!this.dividerPrefab || !this.content) {
            return;
        }

        const dividerNode = instantiate(this.dividerPrefab);

        dividerNode.parent = this.content;
        dividerNode.active = true;

        this.restoreInput(dividerNode);
    }

    // ============================================================
    // content 纵向布局
    // ============================================================

    /**
     * 确保 content 根节点上挂着纵向的 LAYOUT 布局：
     * - 布局类型 VERTICAL：下拉列表项从上到下依次排列
     * - 尺寸模式 CONTAINER：content 高度随子节点自动撑开（不压缩 Item 高度）
     * - 纵向对齐：_isAlign = true，Item 在 content 里水平居中
     * 节点上已经挂过 Layout 时只纠正上述关键项，间距 / 内边距沿用节点上的配置。
     */
    private ensureContentLayout(): Layout | null {
        if (!this.content) {
            return null;
        }

        if (this._contentLayout && this._contentLayout.node === this.content) {
            return this._contentLayout;
        }

        const layout = this.content.getComponent(Layout)
            ?? this.content.addComponent(Layout);

        // 注意：resizeMode 的 setter 在布局类型为 NONE 时会直接返回，必须先设置类型
        layout.type = Layout.Type.VERTICAL;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
        layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
        layout.alignHorizontal = true;

        this._contentLayout = layout;

        return layout;
    }

    /**
     * 立即重排一次 content。
     * Layout 只会对 activeInHierarchy 的子节点生效，所以节点未激活时不用手动刷新，
     * Layout 组件会在节点激活（onEnable）后自己重排。
     */
    private refreshContentLayout(): void {
        const layout = this._contentLayout;

        if (layout && layout.enabledInHierarchy) {
            layout.updateLayout(true);
        }
    }

    // ============================================================
    // 清理 Item
    // ============================================================

    private clearItems() {
        this._items.length = 0;

        const content = this.content;

        if (!content) {
            return;
        }

        // 注意：removeAllChildren() 只是把子节点从父节点摘下来（引擎里就是 node.parent = null），
        // 并不会销毁它们。摘下来又没人管的 Item 就成了游离节点，一直留到 GC —— 每重铺一次列表
        // 就攒一批（节点上的组件、事件处理器也一起悬着）。所以这里显式销毁，
        // destroy 是延迟到帧末执行的，不影响本次重建。
        const children = content.children.slice();
        content.removeAllChildren();

        children.forEach((child) => {
            if (child?.isValid) {
                child.active = false;
                child.destroy();
            }
        });
    }

    // ============================================================
    // Item 点击
    // ============================================================

    private onItemClick(index: number, value: string) {
        this.select(index, true);

        this.close();
    }

    // ============================================================
    // 选择
    // ============================================================

    public select(index: number, notify: boolean = true) {
        if (
            index < 0 ||
            index >= this.options.length
        ) {
            return;
        }

        this._selectedIndex = index;
        this._selectedValue = this.options[index].value;

        this.updateLabel();
        this.refreshItemStates();

        if (
            notify &&
            this._onValueChanged
        ) {
            this._onValueChanged(
                this._selectedIndex,
                this._selectedValue
            );
        }
    }

    // ============================================================
    // 更新显示文字
    // ============================================================

    private updateLabel() {
        if (!this.label) {
            return;
        }

        if (
            this._selectedIndex >= 0 &&
            this._selectedIndex < this.options.length
        ) {
            this.label.string = this.options[this._selectedIndex].label;
        } else {
            this.label.string = '';
        }
    }

    // ============================================================
    // 刷新各 Item 的选中状态
    // ============================================================

    /** 遍历所有 Item，根据 _selectedIndex 同步设置每个 Item 的选中状态 */
    private refreshItemStates(): void {
        for (let i = 0; i < this._items.length; i++) {
            this._items[i].setSelected(i === this._selectedIndex);
        }
    }

    // ============================================================
    // 获取当前选择
    // ============================================================

    public getSelectedIndex(): number {
        return this._selectedIndex;
    }

    public getSelectedValue(): string {
        return this._selectedValue;
    }

    // ============================================================
    // 设置选择回调
    // ============================================================

    public setValueChangedCallback(
        callback: (index: number, value: string) => void
    ) {
        this._onValueChanged = callback;
    }

    // ============================================================
    // 动态添加选项
    // ============================================================

    public addOption(option: DropdownOption) {
        this.options.push(option);

        this.setOptions(this.options);
    }

    // ============================================================
    // 删除选项
    // ============================================================

    public removeOption(index: number) {
        if (
            index < 0 ||
            index >= this.options.length
        ) {
            return;
        }

        this.options.splice(index, 1);

        this.setOptions(this.options);

        if (this.options.length === 0) {
            this._selectedIndex = -1;
            this._selectedValue = '';
            this.updateLabel();

            return;
        }

        const newIndex = Math.min(
            this._selectedIndex,
            this.options.length - 1
        );

        this.select(newIndex, false);
    }

    // ============================================================
    // 销毁
    // ============================================================

    protected onDestroy() {
        this.unregisterClickEvent();
        this.unregisterToggleEvent();
        this.unwatchListActive();

        // 释放共享记录，避免自己销毁之后还被当成「当前展开的那个」/「列表的主人」
        if (this.list && _listOwners.get(this.list) === this) {
            _listOwners.delete(this.list);
        }

        if (this.content && _contentOwners.get(this.content) === this) {
            _contentOwners.delete(this.content);
        }

        this._onValueChanged = null;
        this._contentLayout = null;
        this._toggle = null;
    }
}