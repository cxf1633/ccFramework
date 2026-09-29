import { _decorator, Component, Node, ScrollView, UITransform, instantiate, Prefab, Vec2, warn } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('VirtualGridList')
export class VirtualGridList extends Component {

    @property(Prefab)
    cellPrefab: Prefab = null!;

    @property({ tooltip: "下拉/右拉触发刷新的临界距离" })
    public pullRefreshThreshold: number = 80;

    @property
    private _cellWidth: number = 200;
    @property({ tooltip: "每个单元格的宽度" })
    get cellWidth() { return this._cellWidth; }
    set cellWidth(value: number) { this._cellWidth = value; this._forceUpdate = true; this.updateLayout(); }

    @property
    private _cellHeight: number = 200;
    @property({ tooltip: "每个单元格的高度" })
    get cellHeight() { return this._cellHeight; }
    set cellHeight(value: number) { this._cellHeight = value; this._forceUpdate = true; this.updateLayout(); }

    @property({ tooltip: "不足一屏时强制居中" })
    public forceCenter: boolean = false;

    public onReachTop: Function | null = null;
    public onReachBottom: Function | null = null;
    /**
     * 可见范围变化回调
     * @param startIndex 当前可见区域的起始索引
     * @param endIndex 当前可见区域的结束索引
     * @param visibleIndices 当前可见的所有索引数组
     */
    public onVisibleRangeChanged: ((startIndex: number, endIndex: number, visibleIndices: number[]) => void) | null = null;

    private bInited: boolean = false;
    private _firstInit: boolean = true;
    private _scrollView: ScrollView = null!;
    private _content: Node = null!;
    private _contentUITrans: UITransform = null!;
    private _viewSize: Vec2 = new Vec2();

    private _cellPool: Node[] = [];
    private _cellsInUse: Map<number, Node> = new Map();

    private _dataCount: number = 0;
    private _columnCount: number = 1;
    private _onUpdateItem: ((item: Node, index: number) => void) | null = null;

    private _startIndex: number = -1;
    private _endIndex: number = -1;
    private _sidePadding: number = 0;
    private _topPadding: number = 0;

    private _isAtTop: boolean = false;
    private _isAtBottom: boolean = false;
    private _forceUpdate: boolean = false;

    private _lastOffset: number = -9999;
    private _offsetY: number = 0;
    private _offsetX: number = 0;

    /** 已经提示过「ScrollView 未就绪」，避免每帧刷屏 */
    private _warnedScrollViewMissing: boolean = false;

    /** 因为节点未激活而跳过的刷新，等组件激活后补一次 */
    private _pendingRefresh: boolean = false;

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * `ScrollView` 是否已经就绪。
     *
     * `_scrollView` 只在 `onLoad` 里赋值，而节点未激活（`activeInHierarchy === false`）时
     * 引擎不会调用 `onLoad`；此时 `init()` 里 `scheduleOnce` 排下的回调仍然会执行，
     * 直接取 `this._scrollView.getScrollOffset()` 就会抛
     * "Cannot read properties of null (reading 'getScrollOffset')"。
     *
     * 所以所有用到 `_scrollView` 的入口都先过这里：未就绪就跳过本次刷新并提示一次，
     * 等节点激活（`onLoad` 跑完）后再正常刷新。
     */
    private isScrollViewReady(): boolean {
        if (this._scrollView?.isValid) {
            this._warnedScrollViewMissing = false;
            return true;
        }

        // 节点未激活时 onLoad 还没跑，_scrollView 为空属于正常情况，不刷警告：
        // 这次刷新会记到 _pendingRefresh，等激活后由 flushPendingRefresh 补做。
        // 只有「节点已经激活却依然取不到 ScrollView」才是真正的配置问题，需要提示。
        if (this.node?.activeInHierarchy && !this._warnedScrollViewMissing) {
            this._warnedScrollViewMissing = true;
            warn(`[VirtualGridList] ${this.node.name} 已激活但取不到 ScrollView（节点上没挂 ScrollView，或 view/content 未配置），本次刷新已跳过`);
        }
        return false;
    }

    /**
     * 补做因节点未激活而跳过的刷新。
     * `onLoad` 之后 `_scrollView` 才可用，所以这里放在 onLoad / onEnable 里调用。
     */
    private flushPendingRefresh(): void {
        if (!this._pendingRefresh || !this.isScrollViewReady()) {
            return;
        }

        this._pendingRefresh = false;
        this._forceUpdate = true;
        this.updateLayout();
    }

    // ─────────────────────────────────────────────────────────────────────────

    onLoad() {

        this._scrollView = this.node.getComponent(ScrollView)!;
        this._content = this._scrollView.content!;
        this._contentUITrans = this._content.getComponent(UITransform)!;

        const viewTrans = this._scrollView.view!.getComponent(UITransform)!;
        this._viewSize.set(viewTrans.width, viewTrans.height);

        this._contentUITrans.anchorX = 0;
        this._contentUITrans.anchorY = 1;

        // reset content to top-left after anchor change, prevent offset
        this._content.setPosition(0, 0, 0);

        this.node.on(ScrollView.EventType.SCROLLING, this.onScrolling, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        this.flushPendingRefresh();
    }

    onEnable() {
        // 节点被重新激活时，把之前跳过的刷新补上
        this.flushPendingRefresh();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  公开接口
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 初始化 / 重新初始化列表
     * 多次调用时会完整清空旧节点，保证数据与视图一致
     */
    public init(count: number, onUpdateItem: (item: Node, index: number) => void) {

        //隐藏节点会导致未onload就执行，故延迟一帧
        this.scheduleOnce(() => {
            this._dataCount = count;
            this._onUpdateItem = onUpdateItem;

            // ── 关键：先把所有在用节点全部回收，再重置状态 ──
            // 若不清空，旧节点会残留在 content 上，新数据只覆盖部分导致显示错乱
            this._recycleAllCells();

            this._startIndex = -1;
            this._endIndex = -1;
            this._lastOffset = -9999;  // 让 refresh 的微小偏移过滤失效，确保强制执行
            this._isAtTop = false;
            this._isAtBottom = false;
            this._forceUpdate = true;
            this._scrollView?.stopAutoScroll();
            this.updateLayout();

            // deferred forced refresh after layout
            this.scheduleOnce(() => {
                this._forceUpdate = true;
                // 节点未激活时 ScrollView 还没 onLoad，先记下来，等激活后由 flushPendingRefresh 补做
                if (!this.isScrollViewReady()) {
                    this._pendingRefresh = true;
                    return;
                }
                this.refresh();
            });

            // first init: ensure content aligns to top after all systems stabilize
            if (this._firstInit) {
                this._firstInit = false;
                this.scheduleOnce(() => {
                    this.scrollToTop();
                }, 0.1);
            }
        }, 0)

    }

    public scrollToTop() {
        if (this._scrollView?.vertical) {
            this._scrollView.scrollToTop();
        } else if (this._scrollView) {
            this._scrollView.scrollToLeft();
        }
    }

    public stopAutoScroll()
    {
        this._scrollView?.stopAutoScroll();
    }

    public updateLayout() {
        if (!this._contentUITrans) return;
        if (!this.isScrollViewReady()) return;

        // refresh viewSize: Widget may have changed viewport since onLoad
        const viewTrans = this._scrollView.view!.getComponent(UITransform)!;
        this._viewSize.set(viewTrans.width, viewTrans.height);

        const isVer = this._scrollView.vertical;

        if (isVer) {
            this._columnCount = Math.floor(this._viewSize.x / this._cellWidth) || 1;
            const rowCount = Math.ceil(this._dataCount / this._columnCount);
            const totalH = rowCount * this._cellHeight;
            const totalW = Math.min(this._dataCount, this._columnCount) * this._cellWidth;

            this._topPadding = (this.forceCenter && totalH < this._viewSize.y)
                ? (this._viewSize.y - totalH) / 2 : 0;
            this._sidePadding = (this._viewSize.x - totalW) / 2;

            this._offsetY = this._topPadding;
            this._offsetX = this._sidePadding;

            this._contentUITrans.height = Math.max(totalH + this._topPadding * 2, this._viewSize.y);
            this._contentUITrans.width = Math.max(totalW, this._viewSize.x);
        } else {
            this._columnCount = Math.floor(this._viewSize.y / this._cellHeight) || 1;
            const colCount = Math.ceil(this._dataCount / this._columnCount);
            const totalW = colCount * this._cellWidth;
            const totalH = Math.min(this._dataCount, this._columnCount) * this._cellHeight;

            this._sidePadding = (this.forceCenter && totalW < this._viewSize.x)
                ? (this._viewSize.x - totalW) / 2 : 0;
            this._topPadding = (this._viewSize.y - totalH) / 2;

            this._offsetX = this._sidePadding;
            this._offsetY = this._topPadding;

            this._contentUITrans.width = Math.max(totalW + this._sidePadding * 2, this._viewSize.x);
            this._contentUITrans.height = Math.max(totalH, this._viewSize.y);
        }

        this.refresh();
    }

    /**
     * 刷新指定索引的 cell 数据（不重建节点）
     * 仅当该 cell 当前可见时有效
     */
    public refreshItem(index: number) {
        const node = this._cellsInUse.get(index);
        if (node && this._onUpdateItem) {
            this._onUpdateItem(node, index);
        }
    }

    /**
     * 刷新所有当前可见的 cell 数据
     */
    public refreshAllVisible() {
        if (!this._onUpdateItem) return;
        this._cellsInUse.forEach((node, index) => {
            this._onUpdateItem!(node, index);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  滚动 / 边界检测
    // ─────────────────────────────────────────────────────────────────────────

    private onScrolling() {
        this.checkBoundary();
        this.refresh();
    }

    private onTouchEnd() {
        if (!this.isScrollViewReady()) return;

        const offset = this._scrollView.getScrollOffset();
        if (this._scrollView.vertical) {
            if (offset.y <= -this.pullRefreshThreshold) this.triggerPullRefresh();
        } else {
            if (offset.x >= this.pullRefreshThreshold) this.triggerPullRefresh();
        }
    }

    private triggerPullRefresh() {
        this.onReachTop && this.onReachTop();
    }

    private checkBoundary() {
        if (!this.isScrollViewReady()) return;

        const offset = this._scrollView.getScrollOffset();
        const maxOffset = this._scrollView.getMaxScrollOffset();

        const atTop = this._scrollView.vertical ? offset.y <= 1 : offset.x >= -1;
        if (atTop && !this._isAtTop) {
            this._isAtTop = true;
        } else if (!atTop) {
            this._isAtTop = false;
        }

        const atBottom = this._scrollView.vertical
            ? offset.y >= maxOffset.y - 1
            : offset.x <= -maxOffset.x + 1;
        if (atBottom && !this._isAtBottom) {
            this._isAtBottom = true;
            this.onReachBottom && this.onReachBottom();
        } else if (!atBottom) {
            this._isAtBottom = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  核心刷新逻辑
    // ─────────────────────────────────────────────────────────────────────────

    public refresh() {
        if (!this._onUpdateItem) return;
        if (!this.isScrollViewReady()) return;

        const offset = this._scrollView.getScrollOffset();
        const currentOffset = this._scrollView.vertical ? offset.y : offset.x;

        // 微小抖动过滤：偏移变化 < 0.1 且非强制，直接跳过
        // 注意：_forceUpdate 在此处不做拦截，一定往下走
        if (!this._forceUpdate && Math.abs(currentOffset - this._lastOffset) < 0.1) return;
        this._lastOffset = currentOffset;

        // 计算当前应显示的索引范围
        let start: number;
        let end: number;

        if (this._scrollView.vertical) {
            const relativeY = Math.max(0, offset.y - this._topPadding);
            start = Math.floor(relativeY / this._cellHeight) * this._columnCount;
            end = start + (Math.ceil(this._viewSize.y / this._cellHeight) + 1) * this._columnCount;
        } else {
            const relativeX = Math.max(0, -offset.x - this._sidePadding);
            start = Math.floor(relativeX / this._cellWidth) * this._columnCount;
            end = start + (Math.ceil(this._viewSize.x / this._cellWidth) + 1) * this._columnCount;
        }

        start = Math.max(0, start);
        end = Math.min(this._dataCount - 1, end);

        // guard: when content shrinks, offset may exceed new bounds causing start > end
        if (start > end) {
            start = 0;
            end = Math.min(this._dataCount - 1, (Math.ceil(this._viewSize.y / this._cellHeight) + 1) * this._columnCount - 1);
        }

        const rangeChanged = (this._startIndex !== start || this._endIndex !== end);

        if (rangeChanged || this._forceUpdate) {
            // ── 关键修复：_forceUpdate 必须在进入 _updateVisibleItems「之前」清除 ──
            // 若在内部清除，则回弹触发的第二次 refresh 会因为 range 没变且 _forceUpdate=false
            // 而走进 else 分支，只更新位置不刷新数据
            const wasForced = this._forceUpdate;
            this._forceUpdate = false;

            this._startIndex = start;
            this._endIndex = end;
            this._updateVisibleItems(wasForced);
        } else {
            // range 没变（回弹微调）：只更新位置，不触发数据回调
            this._cellsInUse.forEach((node, index) => this._updateCellPosition(node, index));
        }
    }

    private _updateVisibleItems(forceDataRefresh: boolean = false) {
        // 1. 回收超出范围的节点
        this._cellsInUse.forEach((node, index) => {
            if (index < this._startIndex || index > this._endIndex || index >= this._dataCount) {
                this._recycleCell(index, node);
            }
        });

        // 2. 创建 / 复用 / 更新节点
        for (let i = this._startIndex; i <= this._endIndex; i++) {
            if (i < 0 || i >= this._dataCount) continue;

            let node = this._cellsInUse.get(i);

            if (!node) {
                // 新进入视口：必须刷新数据
                node = this._getOrCreateCell();
                this._cellsInUse.set(i, node);
                this._updateCellPosition(node, i);
                this._onUpdateItem!(node, i);
            } else {
                // 已在视口内
                this._updateCellPosition(node, i);
                // 强制刷新时（如 init 后重建），已存在的节点也要刷新数据
                if (forceDataRefresh) {
                    this._onUpdateItem!(node, i);
                }
            }
        }

        // 3. 触发可见范围变化回调（仅传递完全在视口内的项，排除边缘预加载的部分）
        if (this.onVisibleRangeChanged && this._startIndex >= 0 && this._endIndex >= 0) {
            // 计算完全可见的数量（去掉边缘预加载的 +1）
            let fullyVisibleCount: number;
            // _updateVisibleItems 只从已做就绪校验的 refresh 进来；这里再兜一层
            if (this._scrollView?.vertical ?? true) {
                fullyVisibleCount = Math.ceil(this._viewSize.y / this._cellHeight) * this._columnCount;
            } else {
                fullyVisibleCount = Math.ceil(this._viewSize.x / this._cellWidth) * this._columnCount;
            }

            const actualEnd = Math.min(this._startIndex + fullyVisibleCount - 1, this._endIndex, this._dataCount - 1);

            const visibleIndices: number[] = [];
            for (let i = this._startIndex; i <= actualEnd; i++) {
                if (i >= 0 && i < this._dataCount) {
                    visibleIndices.push(i);
                }
            }
            this.onVisibleRangeChanged(this._startIndex, actualEnd, visibleIndices);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Cell 位置计算
    // ─────────────────────────────────────────────────────────────────────────

    private _updateCellPosition(node: Node, index: number) {
        // 兜底：这条路径正常只从已就绪的 refresh / _updateVisibleItems 进来
        const isVer = this._scrollView ? this._scrollView.vertical : true;
        const mainIdx = Math.floor(index / this._columnCount);
        const subIdx = index % this._columnCount;

        let posX: number;
        let posY: number;

        if (isVer) {
            posX = this._sidePadding + subIdx * this._cellWidth + this._cellWidth / 2;
            posY = -(this._topPadding + mainIdx * this._cellHeight + this._cellHeight / 2);
        } else {
            posX = this._sidePadding + mainIdx * this._cellWidth + this._cellWidth / 2;
            posY = -(this._topPadding + subIdx * this._cellHeight + this._cellHeight / 2);
        }

        // 避免微小误差重复 setPosition
        const cur = node.position;
        if (Math.abs(cur.x - posX) > 0.1 || Math.abs(cur.y - posY) > 0.1) {
            node.setPosition(posX, posY, 0);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Cell 对象池管理
    // ─────────────────────────────────────────────────────────────────────────

    private _getOrCreateCell(): Node {
        let node = this._cellPool.pop();
        if (!node) {
            node = instantiate(this.cellPrefab);
            this._content.addChild(node);
        }
        node.active = true;
        return node;
    }

    private _recycleCell(index: number, node: Node) {
        node.active = false;
        this._cellPool.push(node);
        this._cellsInUse.delete(index);
    }

    /**
     * 将所有正在使用的 cell 全部回收进对象池
     * init 时调用，确保旧数据节点不残留
     */
    private _recycleAllCells() {
        // Use Array.from to safely iterate while deleting entries
        const entries = Array.from(this._cellsInUse.entries());
        for (const [index, node] of entries) {
            this._recycleCell(index, node);
        }
        this._cellsInUse.clear();
    }
}