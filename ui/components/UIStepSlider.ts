import { _decorator, EventTouch, instantiate, Label, Layout, Node, NodeEventType, ProgressBar, Slider, Touch, UITransform, Vec3, Widget } from "cc";

const { ccclass, property } = _decorator;

const SLIDER_EVENT = "slide";

/** 触摸坐标换算用的临时向量，避免每次触摸回调都创建新对象 */
const _touchWorldPos = new Vec3();
const _touchLocalPos = new Vec3();

/** 生成刻度/点数 label 时换算坐标用的临时向量 */
const _gridWorldPos = new Vec3();
const _stepLocalPos = new Vec3();

@ccclass("UIStepSlider")
export class UIStepSlider extends Slider {
    /** 步进变化事件名，外部可通过 node.on("step-changed", ...) 监听 */
    public static readonly STEP_CHANGED_EVENT = "step-changed";

    /**
     * 分隔符（刻度）的模板节点，用于在滑动条上生成每个档位的分隔线。
     * 模板本身摆在哪个节点下都行，生成到哪个父节点由 img_split_parent 决定。
     */
    @property(Node)
    img_split: Node = null;

    /**
     * 分隔符克隆体的父节点；不填时默认用组件所在节点（滑条根节点）。
     * 有了它，模板节点就可以摆在别处（例如一个专门的模板节点下），不影响生成位置。
     */
    @property({ type: Node, tooltip: '分隔符生成的父节点：留空则默认用组件所在节点（滑条根节点）。模板节点放在哪都不影响生成位置' })
    img_split_parent: Node = null;

    /**
     * 首尾是否也各生成一个分隔符（默认开）。
     * 关掉就只生成中间档位的分段线（旧行为）。
     */
    @property({ type: Boolean, tooltip: '首尾也各生成一个分隔符（默认开，落在滑条最左/最右两个档位位置）；关掉只生成中间档位的分段线' })
    img_split_ends: boolean = true;

    /**
     * 可选的滑动进度填充节点（Node 形式，旧用法）。
     * 尺寸与锚点同样由本组件按 direction 自动处理，只是引用的是节点、内部再取 UITransform；
     * 新预制体建议直接用 img_fill_transform。
     */
    @property({ type: Node, tooltip: '进度填充节点（Node 形式，旧用法）：尺寸/锚点由组件按 direction 自动处理；与 img_fill_transform 同时配置时后者优先' })
    img_fill: Node = null;

    /**
     * 进度填充节点的 UITransform 选项（推荐用法）。
     *
     * - 按 direction 决定改哪条边：横向滑条（Horizontal）改**宽度**，纵向滑条（Vertical）改**高度**；
     *   另一条边保持预制体里配好的值不动。
     * - 锚点自动设置：横向 anchorX = 0（贴左边、从左往右长），纵向 anchorY = 0（贴下边、从下往上长），
     *   所以节点位置不用动，长度变化就是「进度方向」。
     * - 进度为 1 时长度/高度与滑条本身完全一致（按滑条的 ContentSize 取），进度为 0 时长度为 0。
     * - 进度变化实时同步：除了组件内部的档位吸附，外部直接改 `slider.progress`、
     *   滑条自身被 Widget/布局改尺寸、运行时切 direction 都能跟上（每帧做一次很便宜的差值校验）。
     *
     * 和 img_fill 二选一即可，两个都配时以本属性为准。
     */
    @property({
        type: UITransform,
        tooltip: '进度填充节点的 UITransform（推荐）：按 direction 决定改宽度（横向）或高度（纵向），锚点自动设置（横向 anchorX=0 / 纵向 anchorY=0），进度 1 时与滑条等长/等高，进度变化实时同步；与 img_fill 同时配置时以本属性为准',
    })
    img_fill_transform: UITransform = null;

    /** 可选的进度条组件，用于显示当前进度 */
    @property(ProgressBar)
    progressBar: ProgressBar = null;

    /**
     * 档位点数 label 的模板（直接把 Label 组件拖进来）。
     * 模板节点摆在哪个节点下都行，生成到哪个父节点由 label_split_parent 决定。
     */
    @property({ type: Label, tooltip: '档位点数 label 的模板（拖 Label 组件）：运行时按档位数克隆，横向按档位网格对齐分隔符；模板节点在预制体里保持隐藏' })
    label_split: Label = null;

    /**
     * 点数 label 克隆体的父节点；不填时默认用组件所在节点（滑条根节点）。
     * 和 img_split_parent 一样，模板节点摆在别处也不影响生成位置。
     */
    @property({ type: Node, tooltip: '点数 label 生成的父节点：留空则默认用组件所在节点（滑条根节点）。模板节点放在哪都不影响生成位置' })
    label_split_parent: Node = null;

    @property()
    /** 总档位数（步进数量） */
    private stepCount: number = 0;

    /** 当前生成的所有分隔线节点 */
    private splitNodes: Node[] = [];
    /** 当前选中的档位索引（从 0 开始） */
    private selectedIndex: number = 0;

    /** 运行时生成的标签列节点 */
    private labelItems: Node[] = [];

    /** 是否正在拖动手柄 */
    private handleDragging: boolean = false;
    /** 正在拖动手柄的触点 id，用于过滤多点触控 */
    private draggingTouchId: number = -1;
    /** 按下手柄时“触摸进度”与当前进度的差值，拖动过程中保持该差值，避免手柄跳到手指中心 */
    private handleGrabOffset: number = 0;

    /** 上一次同步填充尺寸时的填充节点，用于判断填充目标是否被换掉 */
    private lastFillTransform: UITransform | null = null;
    /** 上一次同步填充尺寸时的进度 */
    private lastFillProgress: number = -1;
    /** 上一次同步填充尺寸时的方向 */
    private lastFillDirection: number = -1;
    /** 上一次同步填充尺寸时滑条的宽/高（滑条被布局改尺寸时要跟着重算填充） */
    private lastFillSliderWidth: number = -1;
    private lastFillSliderHeight: number = -1;

    public onEnable(): void {
        super.onEnable();

        // Handle 节点自身或其子节点上可能挂有 Button（例如手柄下的 sp 节点），Button 会在
        // TOUCH_START 时设置 propagationStopped 阻止事件冒泡，导致引擎注册在 Handle 节点上的
        // _onHandleDragStart 收不到事件，表现为手柄无法拖动。
        // 这里在滑条节点上用捕获阶段监听触摸：捕获阶段先于子节点执行，且不受子节点阻止冒泡的影响，
        // 因此无论手柄上挂了什么组件，手柄都能正常拖动。
        this.node.on(NodeEventType.TOUCH_START, this.onHandleTouchStarted, this, true);
        this.node.on(NodeEventType.TOUCH_MOVE, this.onHandleTouchMoved, this, true);
        this.node.on(NodeEventType.TOUCH_END, this.onHandleTouchEnded, this, true);
        this.node.on(NodeEventType.TOUCH_CANCEL, this.onHandleTouchEnded, this, true);
    }

    public onDisable(): void {
        this.node.off(NodeEventType.TOUCH_START, this.onHandleTouchStarted, this, true);
        this.node.off(NodeEventType.TOUCH_MOVE, this.onHandleTouchMoved, this, true);
        this.node.off(NodeEventType.TOUCH_END, this.onHandleTouchEnded, this, true);
        this.node.off(NodeEventType.TOUCH_CANCEL, this.onHandleTouchEnded, this, true);
        this.stopHandleDrag();

        super.onDisable();
    }

    protected start(): void {
        // 先移除旧的监听再注册，防止重复监听导致回调执行多次
        this.node.off(SLIDER_EVENT, this.onSliderChanged, this);
        this.node.on(SLIDER_EVENT, this.onSliderChanged, this);
        this.refreshFillSize();
    }

    /**
     * 每帧校验一次填充节点尺寸。
     *
     * 进度并不总是走 setProgressValue：外部代码直接写 `slider.progress = x`、滑条自身被
     * Widget/布局改了尺寸、运行时切 direction，这些都得让填充跟上去，
     * 所以这里用一个几乎零成本的差值判断兜住（值没变就直接返回）。
     */
    protected update(): void {
        const fillTransform = this.resolveFillTransform();
        const sliderTransform = this.node.getComponent(UITransform);

        if (!fillTransform || !sliderTransform || fillTransform === sliderTransform) {
            return;
        }

        if (
            this.lastFillTransform === fillTransform
            && this.lastFillProgress === this.progress
            && this.lastFillDirection === this.direction
            && this.lastFillSliderWidth === sliderTransform.contentSize.width
            && this.lastFillSliderHeight === sliderTransform.contentSize.height
        ) {
            return;
        }

        this.refreshFillSize(fillTransform, sliderTransform);
    }

    /**
     * 设置总档位数并刷新分隔线
     * @param stepCount 档位数量（会向下取整并保证不小于 0）
     * @param selectedIndex 设置完成后选中的档位索引（可选，默认保持当前索引）
     */
    public setStepCount(stepCount: number, selectedIndex: number = this.selectedIndex): void {
        this.stepCount = Math.max(0, Math.floor(stepCount));
        this.selectedIndex = this.clampIndex(selectedIndex);
        this.setProgressByIndex(this.selectedIndex);
        this.refreshSplitNodes();
    }

    /** 获取当前选中的档位索引（从 0 开始） */
    public getSelectedIndex(): number {
        return this.selectedIndex;
    }

    /**
     * 设置当前选中的档位索引
     * @param index 目标档位索引（会自动钳制到合法范围）
     * @param emitEvent 是否派发 step-changed 事件（默认 true）
     */
    public setSelectedIndex(index: number, emitEvent: boolean = true): void {
        this.selectedIndex = this.clampIndex(index);
        this.setProgressByIndex(this.selectedIndex);
        if (emitEvent) {
            this.emitStepChanged();
        }
    }

    /** 销毁并清空所有已生成的分隔线节点 */
    public clearSplitNodes(): void {
        this.splitNodes.forEach((splitNode) => {
            if (splitNode?.isValid) {
                // 先取消激活再销毁：destroy 是延迟到帧末执行的，留着会被本帧的排版/渲染算进去
                splitNode.active = false;
                splitNode.destroy();
            }
        });

        this.splitNodes.length = 0;
    }

    /** 根据当前档位数重新生成分隔线节点 */
    private refreshSplitNodes(): void {
        // 先清空旧的分隔线，保证重新生成时不残留
        this.clearSplitNodes();

        // 未配置分隔线模板节点则直接返回
        if (!this.img_split?.isValid) {
            return;
        }

        this.img_split.active = false;
        // 只有一个档位（或没有档位）时没有可分隔的位置
        if (this.stepCount <= 1) {
            this.keepHandleOnTop(this.resolveSplitParent());
            return;
        }

        if (!this.node.getComponent(UITransform)) {
            return;
        }

        // 计算分隔线起始位置、间距，并逐个实例化出各档位的分隔线
        const splitParent = this.resolveSplitParent();
        const { startX, step } = this.getStepMetrics(this.stepCount);

        // 默认首尾也各来一个：0 ~ stepCount-1；关掉 img_split_ends 就只留中间档位（旧行为）
        const first = this.img_split_ends ? 0 : 1;
        const last = this.img_split_ends ? this.stepCount - 1 : this.stepCount - 2;

        for (let i = first; i <= last; i++) {
            const splitNode = instantiate(this.img_split);
            splitNode.name = `${this.img_split.name}_${i}`;
            splitNode.active = true;
            splitParent.addChild(splitNode);
            this.disableWidgets(splitNode);
            splitNode.setPosition(this.resolveStepPosition(splitParent, this.img_split, startX + step * i));
            this.splitNodes.push(splitNode);
        }

        this.keepHandleOnTop(splitParent);
    }

    /**
     * 分隔符的父节点：优先 Inspector 上指定的 img_split_parent，
     * 没填就用组件所在节点（滑条根节点）—— 分隔线本来就是围着滑条摆的，默认挂在自己身上最稳。
     */
    private resolveSplitParent(): Node {
        return this.img_split_parent?.isValid ? this.img_split_parent : this.node;
    }

    /**
     * 点数 label 的父节点：优先 Inspector 上指定的 label_split_parent，
     * 没填同样用组件所在节点（滑条根节点）。
     */
    private resolveLabelParent(): Node {
        return this.label_split_parent?.isValid ? this.label_split_parent : this.node;
    }

    /**
     * 算出一个刻度/点数在目标父节点本地坐标里的位置。
     *
     * 横向取档位网格（滑条本地坐标里的 startX + step * i），纵/深取模板节点当前的世界位置；
     * 两段都先换算到世界坐标、再转进目标父节点本地坐标，于是
     * 「模板节点摆在哪」和「父节点自己有没有偏移/缩放」都不影响结果
     * （父节点与滑条重合时就是模板原来的 y/z，和以前一样）。
     */
    private resolveStepPosition(parent: Node, templateNode: Node, gridX: number): Vec3 {
        const templatePos = templateNode.position;
        const parentTransform = parent.getComponent(UITransform);
        const sliderTransform = this.node.getComponent(UITransform);

        if (!parentTransform || !sliderTransform) {
            // 没有 UITransform 就没法换算，退回「网格 x + 模板自身的 y/z」
            return _stepLocalPos.set(gridX, templatePos.y, templatePos.z);
        }

        // convertToWorldSpaceAR / convertToNodeSpaceAR 内部会先 updateWorldTransform，
        // 不会读到旧矩阵；模板的世界坐标要先自己刷一次（worldPosition 只是个取值器）
        sliderTransform.convertToWorldSpaceAR(_gridWorldPos.set(gridX, 0, 0), _gridWorldPos);
        templateNode.updateWorldTransform();

        const templateWorldPos = templateNode.worldPosition;
        _gridWorldPos.set(_gridWorldPos.x, templateWorldPos.y, templateWorldPos.z);

        return parentTransform.convertToNodeSpaceAR(_gridWorldPos, _stepLocalPos);
    }

    /**
     * 档位网格：第 i 档在滑条本地坐标里的 x = startX + step * i。
     * 分隔符、档位点数 label 都用这一套，保证它们和手柄落在同一列上。
     */
    private getStepMetrics(count: number): { startX: number; step: number } {
        const sliderTransform = this.node.getComponent(UITransform);
        const sliderWidth = sliderTransform?.contentSize.width ?? 0;
        const startX = -sliderWidth * (sliderTransform?.anchorPoint.x ?? 0.5);
        const step = count > 1 ? sliderWidth / (count - 1) : 0;

        return { startX, step };
    }

    /**
     * 关掉节点（含所有子节点）上的 Widget。
     *
     * 预制体里的刻度/点数 label 模板上常常挂着 Widget（`alignFlags = LEFT/RIGHT`、
     * `alignMode = ALWAYS`），克隆体会被它每帧重新对齐到父节点边缘 —— 表现就是
     * 「分隔符全挤在同一个位置、根本没有等距排列」，代码算出来的 x 会被覆盖掉。
     * 所以这些由代码摆位置的克隆体，挂上去之前先把 Widget 关掉。
     */
    private disableWidgets(node: Node): void {
        const widget = node.getComponent(Widget);
        if (widget) {
            widget.enabled = false;
        }

        node.children.forEach((child) => this.disableWidgets(child));
    }

    /** 保证填充节点高于分隔线，滑块手柄保持在最上层 */
    private keepHandleOnTop(splitParent: Node): void {
        // if (this.img_fill?.parent === splitParent) {
        //     this.img_fill.setSiblingIndex(splitParent.children.length - 1);
        // }

        // 手柄优先取 Slider 自己配的 handle：预制体里手柄节点常常叫 Btn_Handle 之类的名字，
        // 按 "Handle" 去找会找不到，生成出来的分隔线就会盖在手柄上面
        const handleNode = this.handle?.node ?? this.node.getChildByName("Handle");
        if (handleNode?.parent === splitParent) {
            handleNode.setSiblingIndex(splitParent.children.length - 1);
        }
    }

    // ============================================================
    // 档位标签（每个档位一格文字，例如牌局时长每个阶段的小时数）
    // ============================================================

    /**
     * 按档位数刷新点数 label，并逐个写入文字。
     *
     * 用法：传进来的数组长度就是档位数，第 i 个值写进第 i 个 label。
     * label 从 label_split（Label 组件）克隆，克隆体加到 label_split_parent 下（不填就是组件所在节点），
     * 位置按档位网格 startX + step * i 摆放，所以和分隔符、手柄都在同一列上。
     *
     * 没配 label_split 时什么都不做。
     */
    public setStepLabels(values: ReadonlyArray<string>): void {
        const template = this.label_split;

        if (!template?.isValid) {
            return;
        }

        const templateNode = template.node;

        if (!templateNode?.isValid) {
            return;
        }

        this.clearStepLabels();

        // 模板节点自己只当模板：预制体里它就是隐藏的样板
        templateNode.active = false;

        const count = values.length;
        if (count <= 0) {
            return;
        }

        const parent = this.resolveLabelParent();

        // 位置由代码按档位网格算：容器上要是挂了 Layout，会把位置覆盖掉，先关掉
        const layoutComp = parent.getComponent(Layout);
        if (layoutComp) {
            layoutComp.enabled = false;
        }

        const { startX, step } = this.getStepMetrics(count);

        for (let i = 0; i < count; i++) {
            const item = instantiate(templateNode);
            item.name = `${templateNode.name}_${i + 1}`;
            item.active = true;
            parent.addChild(item);
            this.disableWidgets(item);
            item.setPosition(this.resolveStepPosition(parent, templateNode, startX + step * i));

            const label = item.getComponent(Label);
            if (label) {
                label.string = values[i];
            }

            this.labelItems.push(item);
        }
    }

    /** 销毁运行时生成的所有点数 label（label_split 模板节点本身保持隐藏、不销毁） */
    public clearStepLabels(): void {
        this.labelItems.forEach((item) => {
            if (item?.isValid) {
                // 先取消激活再销毁：destroy 是延迟到帧末执行的，留着会影响本帧的排版计算
                item.active = false;
                item.destroy();
            }
        });

        this.labelItems.length = 0;
    }

    /** 滑块拖动回调（引擎内部逻辑，例如点击/拖动轨道）：将滑动进度吸附到最近的档位 */
    private onSliderChanged(): void {
        this.applyProgress(this.progress);
    }

    /** 触摸开始：仅当按在 Handle 上时由本组件接管拖动，按在轨道上仍交给引擎处理 */
    private onHandleTouchStarted(event: EventTouch): void {
        // 已经有一根手指在拖动手柄，或只有一个档位（无处可拖）时不处理
        if (this.handleDragging || this.stepCount === 1) {
            return;
        }

        const touch = event.touch;
        if (!touch || !this.isTouchOnHandle(event, touch)) {
            return;
        }

        this.handleDragging = true;
        this.draggingTouchId = touch.getID();
        // 记录按下点进度与当前进度之间的差值，拖动时保持该差值，手柄不会跳到手指中心
        this.handleGrabOffset = this.progress - this.getProgressByTouch(touch);
    }

    /** 触摸移动：按触摸位置更新进度并吸附到最近档位 */
    private onHandleTouchMoved(event: EventTouch): void {
        const touch = event.touch;
        if (!this.handleDragging || !touch || touch.getID() !== this.draggingTouchId) {
            return;
        }

        this.applyProgress(this.getProgressByTouch(touch) + this.handleGrabOffset);

        // 阻止事件继续传递：避免子节点上的 Button 与引擎自身的拖动逻辑重复处理，
        // 同时防止父级 ScrollView 在拖动手柄时跟着滚动
        event.propagationStopped = true;
    }

    /** 触摸结束/取消：结束本次手柄拖动 */
    private onHandleTouchEnded(event: EventTouch): void {
        const touch = event.touch;
        if (!this.handleDragging || !touch || touch.getID() !== this.draggingTouchId) {
            return;
        }

        this.stopHandleDrag();
        // 复位引擎内部的拖动状态；不传 event，避免设置 propagationStopped 影响子节点 Button 的点击
        super._onTouchEnded();
    }

    /** 结束手柄拖动并清理拖动相关的缓存数据 */
    private stopHandleDrag(): void {
        this.handleDragging = false;
        this.draggingTouchId = -1;
        this.handleGrabOffset = 0;
    }

    /** 判断本次触摸是否按在 Handle 上（命中手柄本身或手柄子节点都算） */
    private isTouchOnHandle(event: EventTouch, touch: Touch): boolean {
        const handleNode = this.handle?.node;
        if (!handleNode?.isValid) {
            return false;
        }

        const handleTransform = handleNode.getComponent(UITransform);
        if (handleTransform?.hitTest(touch.getLocation(), event.windowId)) {
            return true;
        }

        // 手柄子节点（例如手柄下的 sp 按钮）可能比手柄略大，命中子节点时同样按拖动手柄处理
        const target = event.target as Node | null;
        return !!target && (target === handleNode || target.isChildOf(handleNode));
    }

    /** 计算触摸点在滑条上对应的进度（0~1，未做档位吸附） */
    private getProgressByTouch(touch: Touch): number {
        const sliderTransform = this.node.getComponent(UITransform);
        if (!sliderTransform) {
            return this.progress;
        }

        const uiLocation = touch.getUILocation();
        _touchWorldPos.set(uiLocation.x, uiLocation.y, 0);
        sliderTransform.convertToNodeSpaceAR(_touchWorldPos, _touchLocalPos);

        const contentSize = sliderTransform.contentSize;
        const anchorPoint = sliderTransform.anchorPoint;
        if (this.direction === Slider.Direction.Horizontal) {
            if (contentSize.width <= 0) {
                return this.progress;
            }

            return this.clampProgress((_touchLocalPos.x + contentSize.width * anchorPoint.x) / contentSize.width);
        }

        if (contentSize.height <= 0) {
            return this.progress;
        }

        return this.clampProgress((_touchLocalPos.y + contentSize.height * anchorPoint.y) / contentSize.height);
    }

    /** 按滑动进度吸附到最近档位并刷新显示，档位发生变化时派发 step-changed 事件 */
    private applyProgress(progress: number): void {
        const clampedProgress = this.clampProgress(progress);

        // 还没有配置档位（stepCount 为 0）：没有档位可以吸附，让手柄自由跟随手指，
        // 否则手柄会被强行拉回起点，表现为无法拖动
        if (this.stepCount <= 0) {
            if (this.progress === clampedProgress) {
                return;
            }

            this.selectedIndex = 0;
            this.setProgressValue(clampedProgress);
            this.emitStepChanged();
            return;
        }

        // 只有一个档位：进度固定为起点
        if (this.stepCount === 1) {
            if (this.progress === 0) {
                return;
            }

            this.selectedIndex = 0;
            this.setProgressByIndex(this.selectedIndex);
            this.emitStepChanged();
            return;
        }

        const index = this.clampIndex(Math.round(clampedProgress * (this.stepCount - 1)));
        const snappedProgress = index / (this.stepCount - 1);
        // 档位与进度都没有变化时无需重复刷新与派发事件
        if (index === this.selectedIndex && this.progress === snappedProgress) {
            return;
        }

        this.selectedIndex = index;
        this.setProgressByIndex(index);
        this.emitStepChanged();
    }

    /** 根据档位索引计算并设置滑块的进度（0~1） */
    private setProgressByIndex(index: number): void {
        this.setProgressValue(this.stepCount > 1 ? index / (this.stepCount - 1) : 0);
    }

    /** 直接按进度值刷新滑块、进度条与填充节点（不做档位换算） */
    private setProgressValue(progress: number): void {
        this.progress = progress;
        if (this.progressBar) {
            this.progressBar.progress = progress;
        }
        this.refreshFillSize();
    }

    /**
     * 填充节点的 UITransform：优先取 img_fill_transform（UITransform 选项），
     * 没配就退回 img_fill（Node 形式）身上的 UITransform，两者都没配返回 null。
     */
    private resolveFillTransform(): UITransform | null {
        if (this.img_fill_transform?.isValid) {
            return this.img_fill_transform;
        }

        return this.img_fill?.isValid ? this.img_fill.getComponent(UITransform) : null;
    }

    /**
     * 按滑条方向同步填充节点的锚点与尺寸。
     *
     * 横向滑条改宽度、纵向滑条改高度，另一条边保持预制体里配好的值；
     * 锚点自动设置（横向靠左、纵向靠下），于是节点位置不用动，长度就是进度本身；
     * 进度为 1 时该边长度与滑条 ContentSize 完全一致。
     */
    private refreshFillSize(
        fillTransform: UITransform | null = this.resolveFillTransform(),
        sliderTransform: UITransform | null = this.node.getComponent(UITransform),
    ): void {
        if (!fillTransform?.isValid || !sliderTransform || fillTransform === sliderTransform) {
            // 填充节点不能是滑条自己：两个尺寸互相驱动会不断缩水，直接不处理
            return;
        }

        const progress = this.clampProgress(this.progress);
        // 先把滑条的宽高与填充的原始尺寸取成数值：下面的 setContentSize 改的是同一个 Size 对象
        const sliderWidth = sliderTransform.contentSize.width;
        const sliderHeight = sliderTransform.contentSize.height;
        const fillWidth = fillTransform.contentSize.width;
        const fillHeight = fillTransform.contentSize.height;
        const anchorX = fillTransform.anchorPoint.x;
        const anchorY = fillTransform.anchorPoint.y;

        // 填充节点上要是挂了 Widget 且 alignMode = ALWAYS，它会每帧按对齐规则把尺寸/锚点改回去
        // （本组件 setContentSize/setAnchorPoint 触发的 SIZE_CHANGED/ANCHOR_CHANGED 还会让它标脏重排），
        // 表现就是「进度在动、填充条不动」。尺寸既然由本组件驱动，这里先把这种 Widget 关掉。
        const fillWidget = fillTransform.getComponent(Widget);
        if (fillWidget?.enabled && fillWidget.alignMode === Widget.AlignMode.ALWAYS) {
            fillWidget.enabled = false;
        }

        if (this.direction === Slider.Direction.Vertical) {
            // 纵向：改高度，锚点贴下边
            fillTransform.setAnchorPoint(anchorX, 0);
            fillTransform.setContentSize(fillWidth, sliderHeight * progress);
        } else {
            // 横向：改宽度（长度），锚点贴左边
            fillTransform.setAnchorPoint(0, anchorY);
            fillTransform.setContentSize(sliderWidth * progress, fillHeight);
        }

        // 记录本次同步的状态，update() 靠它判断下一帧要不要重算
        this.lastFillTransform = fillTransform;
        this.lastFillProgress = this.progress;
        this.lastFillDirection = this.direction;
        this.lastFillSliderWidth = sliderWidth;
        this.lastFillSliderHeight = sliderHeight;
    }

    /** 将进度限制在 0~1 之间 */
    private clampProgress(progress: number): number {
        return Math.max(0, Math.min(1, progress));
    }

    /** 将索引钳制到合法范围 [0, stepCount - 1]，并向下取整 */
    private clampIndex(index: number): number {
        if (this.stepCount <= 1) {
            return 0;
        }

        return Math.max(0, Math.min(this.stepCount - 1, Math.round(index)));
    }

    /** 向外派发 step-changed 事件，参数为当前索引、进度和组件本身 */
    private emitStepChanged(): void {
        this.node.emit(UIStepSlider.STEP_CHANGED_EVENT, this.selectedIndex, this.progress, this);
    }
}
