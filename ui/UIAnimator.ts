import { Color, Node, Sprite, Tween, TweenEasing, UIOpacity, Widget, tween } from 'cc';

/** UI 动画类型枚举：3 个入口（playOne / play / playMany）共用 */
export enum UIAnimType {
    /** 放大出现 */
    POP_IN = 'popIn',
    /** 缩小消失 */
    POP_OUT = 'popOut',
    /** 原地旋转 */
    SPIN = 'spin',
    /** 颜色渐变 */
    COLOR = 'color',
    /** 整体透明度渐变 */
    OPACITY = 'opacity',
    /** 位移回弹：从「当前原位 + 指定像素偏移」缓动回到原位（不是移动到外部目标点） */
    MOVE_BACK = 'moveBack',
}

/** 单条动画的配置（3 个入口共用） */
export interface UIAnimOption {
    /** 动画类型 */
    type: UIAnimType;
    /** 时长（秒），不传用对应动画默认时长 */
    duration?: number;
    /** SPIN 用：旋转角度（度，默认 DEFAULT_SPIN_ANGLE） */
    angle?: number;
    /** 缓动函数名（默认 DEFAULT_EASING = cubicOut），想要别的节奏自行指定 */
    easing?: TweenEasing;
    /** COLOR 用：起始颜色（默认 #000000） */
    fromColor?: Color;
    /** COLOR 用：目标颜色（默认 #FFFFFF） */
    toColor?: Color;
    /** OPACITY 用：起始透明度（默认 0） */
    fromOpacity?: number;
    /** OPACITY 用：目标透明度（默认 255） */
    toOpacity?: number;
    /** 开始延迟（秒，默认 0），用于错开并行动画（如先 popIn 再 spin） */
    delay?: number;
    /** MOVE_BACK 用：起始相对原位的 X 偏移（像素，向右为正，默认 0） */
    offsetX?: number;
    /** MOVE_BACK 用：起始相对原位的 Y 偏移（像素，向上为正，默认 0） */
    offsetY?: number;
}

/**
 * 单个动画「构建器」：对节点做起始态准备，并返回一条【未 start】的 tween。
 * 之所以不在构建器里 start，是为了让 3 个入口统一决定：单播 / 并行 / 批量。
 * 返回 null 表示当前节点无法播放该动画（如 COLOR 但节点没有 Sprite）。
 */
type AnimBuilder = (node: Node, anim: UIAnimOption) => Tween<any> | null;

/**
 * UI 动画工具。对外只暴露 3 个调用入口：
 * 1. `UIAnimator.playOne(node, anim, onComplete?)`  —— 给「单个节点」播「单个动画」；
 * 2. `UIAnimator.play(node, anims, onComplete?)`    —— 给「单个节点」并行播「多个动画」；
 * 3. `UIAnimator.playMany(nodes, anim, onComplete?)`—— 给「一组节点」播「同一个动画」。
 *
 * 实现约定（消除重复）：每种动画只在 `_buildXxx` 里封装一次，返回 `Tween<any>`，并登记进 `_BUILDERS`；
 * 3 个入口与「通道隔离」全部走这张表。新增一种动画只需：
 *   ① `UIAnimType` 加枚举；② 写一个 `_buildXxx`（返回 Tween）；③ 在 `_BUILDERS` 登记一行；④ `_channelOf` 补通道。
 * 3 个入口会自动支持，不会出现「独立方法 + switch 分支」两份重复逻辑。
 *
 * 通道隔离：scale / rotation / position / color / opacity 各占一个通道，跨通道可真正并行；
 * 同通道重播会先停掉旧 tween（保证从头播而非续播）。
 *
 * 节点销毁安全：tween 目标是「代理对象 / Sprite」，引擎不会随节点销毁自动收尾；
 * 故每个 onUpdate 都做 isValid 兜底（节点销毁即停掉该节点所有动画），
 * 并提供 `UIAnimator.stopAll(node)` 供组件 onDestroy 主动「停止 + 释放」（推荐，立即且零后续开销）。
 */
export class UIAnimator {
    /** 默认缩放（静态时的正常尺寸） */
    public static readonly DEFAULT_SCALE = 1;
    /** 出现动画起始缩放（从 0 放大到默认） */
    public static readonly POP_IN_FROM = 0;
    /** 消失动画结束缩放（缩小到 0） */
    public static readonly POP_OUT_TO = 0;
    /** 默认动画时长（秒） */
    public static readonly DEFAULT_DURATION = 0.2;
    /** 旋转默认角度（度） */
    public static readonly DEFAULT_SPIN_ANGLE = 360;
    /** 公共默认缓动：ease-out，先快后慢，临近结束自然降速；具体动画想要别的节奏由开发者传 anim.easing 自行选择 */
    public static readonly DEFAULT_EASING: TweenEasing = 'cubicOut';

    /** 动画通道名：通道隔离，使不同动画可在同一节点并行播放 */
    private static readonly CH_SCALE = 'scale';
    private static readonly CH_ROTATION = 'rotation';
    /** 位移通道名：与 scale / rotation 隔离，可并行播放 */
    private static readonly CH_POSITION = 'position';
    /** 颜色通道名 */
    private static readonly CH_COLOR = 'color';
    /** 透明度通道名 */
    private static readonly CH_OPACITY = 'opacity';
    /** play() 并行根动画占用的通道：重播时停掉整条并行 tween */
    private static readonly CH_PARALLEL = 'parallel';

    /**
     * 动画类型 -> 构建器的唯一登记处。
     * 用箭头包一层是为了「调用时」才解析 `UIAnimator._buildXxx`，避免静态初始化顺序问题。
     */
    private static readonly _BUILDERS: Record<UIAnimType, AnimBuilder> = {
        [UIAnimType.POP_IN]: (node, anim) => UIAnimator._buildPopIn(node, anim),
        [UIAnimType.POP_OUT]: (node, anim) => UIAnimator._buildPopOut(node, anim),
        [UIAnimType.SPIN]: (node, anim) => UIAnimator._buildSpin(node, anim),
        [UIAnimType.COLOR]: (node, anim) => UIAnimator._buildColor(node, anim),
        [UIAnimType.OPACITY]: (node, anim) => UIAnimator._buildOpacity(node, anim),
        [UIAnimType.MOVE_BACK]: (node, anim) => UIAnimator._buildMoveBack(node, anim),
    };

    /** 每个节点按通道记录正在播放的 tween，仅用于「重播时停掉同通道旧动画」 */
    private static _tweens = new WeakMap<Node, Record<string, Tween<any> | undefined>>();


    // ==================== 3 个公开调用入口 ====================

    /**
     * 入口 1：给单个节点播单个动画。
     * 播放前会先停掉「该动画所在通道」的旧 tween（同通道互斥、跨通道不受影响）。
     * @param node 目标节点
     * @param anim 动画配置
     * @param onComplete 结束回调（节点无效 / 无法播放时也会立即回调）
     */
    public static playOne(node: Node | null | undefined, anim: UIAnimOption, onComplete?: () => void): void {
        if (!node || !node.isValid || !anim) {
            onComplete?.();
            return;
        }

        const channel = UIAnimator._channelOf(anim.type);
        UIAnimator._stopChannel(node, channel);
        const sub = UIAnimator._BUILDERS[anim.type]?.(node, anim);
        if (!sub) {
            onComplete?.();
            return;
        }

        const tw = sub.call(() => {
            UIAnimator._clearChannel(node, channel);
            if (!node.isValid) return;
            onComplete?.();
        }).start();
        UIAnimator._track(node, channel, tw);
    }

    /**
     * 入口 2：给单个节点「并行」播放一组动画。
     * 所有动画挂到同一条根 tween 上用 `tween(node).parallel(...)` 真正同时执行（不是各自 start 两条独立 tween）。
     * 冲突由调用方负责（例如同时传 POP_IN 与 POP_OUT 属于调用错误，本方法不处理）。
     * @param node 目标节点
     * @param anims 动画配置数组（顺序无关，全部并行执行）
     * @param onComplete 全部动画结束后的回调（数组为空 / 节点无效时立即回调）
     */
    public static playParallel(node: Node | null | undefined, anims: UIAnimOption[], onComplete?: () => void): void {
        if (!node || !node.isValid) {
            onComplete?.();
            return;
        }
        if (!anims || anims.length === 0) {
            onComplete?.();
            return;
        }

        // 重播前停掉该节点上所有通道的旧动画，避免叠加（新增动画类型无需在此追加）
        UIAnimator._stopAllChannels(node);

        const subs: Tween<any>[] = [];
        for (const anim of anims) {
            const sub = UIAnimator._BUILDERS[anim.type]?.(node, anim);
            if (sub) {
                subs.push(sub);
            }
        }

        if (subs.length === 0) {
            onComplete?.();
            return;
        }

        const root = tween(node)
            .parallel(...subs)
            .call(() => {
                UIAnimator._clearChannel(node, UIAnimator.CH_PARALLEL);
                if (!node.isValid) return;
                onComplete?.();
            })
            .start();
        UIAnimator._track(node, UIAnimator.CH_PARALLEL, root);
    }

    /**
     * 入口 3：给「一组节点」播放「同一个动画」。
     * 每个节点各自独立播放（各自走 playOne，通道隔离与销毁兜底一致），
     * 全部播完后统一回调 onComplete。
     * @param nodes 目标节点数组（null / 无效节点会被自动跳过）
     * @param anim 动画配置（所有节点共用同一份配置）
     * @param onComplete 全部节点播放完成后的回调（数组为空时立即回调）
     */
    public static playMany(nodes: ReadonlyArray<Node | null | undefined>, anim: UIAnimOption, onComplete?: () => void): void {
        if (!anim) {
            onComplete?.();
            return;
        }
        const list = (nodes ?? []).filter((node): node is Node => !!node && node.isValid);
        if (list.length === 0) {
            onComplete?.();
            return;
        }

        let remaining = list.length;
        const handleOneDone = () => {
            remaining--;
            if (remaining <= 0) {
                onComplete?.();
            }
        };
        for (const node of list) {
            UIAnimator.playOne(node, anim, handleOneDone);
        }
    }

    // ==================== 动画构建器（每种动画唯一一份，返回未 start 的 Tween） ====================

    /** 构建 POP_IN：放大出现 */
    private static _buildPopIn(node: Node, anim: UIAnimOption): Tween<any> {
        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;

        node.active = true;
        // 立即复位到起始缩放，避免衔接打断时的残值/闪烁
        node.setScale(UIAnimator.POP_IN_FROM, UIAnimator.POP_IN_FROM, UIAnimator.DEFAULT_SCALE);
        const proxy = { sx: UIAnimator.POP_IN_FROM, sy: UIAnimator.POP_IN_FROM, sz: UIAnimator.DEFAULT_SCALE };
        let tw: Tween<any> = tween(proxy);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, {
            sx: UIAnimator.DEFAULT_SCALE,
            sy: UIAnimator.DEFAULT_SCALE,
            sz: UIAnimator.DEFAULT_SCALE,
        }, {
            easing: anim.easing ?? UIAnimator.DEFAULT_EASING,
            onUpdate: (t: any) => {
                if (!UIAnimator._alive(node)) return;
                node.setScale(t.sx, t.sy, t.sz);
            },
        }).call(() => {
            if (!node.isValid) return;
            // 结束再复位一次，保证受控变量回到默认
            node.setScale(UIAnimator.DEFAULT_SCALE, UIAnimator.DEFAULT_SCALE, UIAnimator.DEFAULT_SCALE);
        });
    }

    /** 构建 POP_OUT：缩小消失（结束后关闭节点并把缩放复位到默认，便于下次 popIn 干净重播） */
    private static _buildPopOut(node: Node, anim: UIAnimOption): Tween<any> {
        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;

        node.active = true; // 先确保可见，才能播放缩小动画
        const proxy = { sx: node.scale.x, sy: node.scale.y, sz: node.scale.z };
        let tw: Tween<any> = tween(proxy);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, {
            sx: UIAnimator.POP_OUT_TO,
            sy: UIAnimator.POP_OUT_TO,
            sz: UIAnimator.DEFAULT_SCALE,
        }, {
            easing: anim.easing ?? UIAnimator.DEFAULT_EASING,
            onUpdate: (t: any) => {
                if (!UIAnimator._alive(node)) return;
                node.setScale(t.sx, t.sy, t.sz);
            },
        }).call(() => {
            if (!node.isValid) return;
            node.active = false;
            node.setScale(UIAnimator.DEFAULT_SCALE, UIAnimator.DEFAULT_SCALE, UIAnimator.DEFAULT_SCALE);
        });
    }

    /** 构建 SPIN：原地旋转（以「当前角度」为终点，从「当前角度 - angle」转回原角度） */
    private static _buildSpin(node: Node, anim: UIAnimOption): Tween<any> {
        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;
        const angle = anim.angle ?? UIAnimator.DEFAULT_SPIN_ANGLE;
        const easing = anim.easing ?? UIAnimator.DEFAULT_EASING;

        // UI 节点用 node.angle 控制 2D 旋转；不要用 setRotationFromEuler / eulerAngles
        // （那改的是 rotation 四元数，UI 不吃，日志里 eulerAngles 在变但画面不转）。
        const endAngle = node.angle;
        const startAngle = endAngle - angle;
        node.angle = startAngle; // 立即复位到起点，避免衔接闪烁
        const proxy = { angle: startAngle };
        let tw: Tween<any> = tween(proxy);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, { angle: endAngle }, {
            easing,
            onUpdate: (t: any) => {
                if (!UIAnimator._alive(node)) return;
                node.angle = t.angle;
            },
        }).call(() => {
            if (!node.isValid) return;
            node.angle = endAngle;
        });
    }

    /** 构建 COLOR：Sprite 颜色渐变；节点无 Sprite 时返回 null（视为不可播放） */
    private static _buildColor(node: Node, anim: UIAnimOption): Tween<any> | null {
        const sprite = node.getComponent(Sprite);
        if (!sprite) {
            return null;
        }

        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;
        const from = anim.fromColor ?? new Color(0, 0, 0, 255);
        const to = anim.toColor ?? new Color(255, 255, 255, 255);

        // 从头重播：清掉该 Sprite 上遗留的 tween，并从起始色开始
        Tween.stopAllByTarget(sprite);
        sprite.color = from.clone();
        let tw: Tween<any> = tween(sprite);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, { color: to }, {
            easing: anim.easing ?? UIAnimator.DEFAULT_EASING,
            // color 由 tween 直接写 sprite 属性，这里靠 isValid 兜底：节点销毁即停掉整条动画
            onUpdate: () => { UIAnimator._alive(node); },
        });
    }

    /** 构建 OPACITY：通过父节点 UIOpacity 让整棵 UI 子树从透明渐变到不透明。 */
    private static _buildOpacity(node: Node, anim: UIAnimOption): Tween<any> {
        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;
        const fromOpacity = anim.fromOpacity ?? 0;
        const toOpacity = anim.toOpacity ?? 255;
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);

        opacity.opacity = fromOpacity;
        const proxy = { opacity: fromOpacity };
        let tw: Tween<any> = tween(proxy);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, { opacity: toOpacity }, {
            easing: anim.easing ?? UIAnimator.DEFAULT_EASING,
            onUpdate: (state: any) => {
                if (!UIAnimator._alive(node) || !opacity.isValid) return;
                opacity.opacity = state.opacity;
            },
        }).call(() => {
            if (node.isValid && opacity.isValid) {
                opacity.opacity = toOpacity;
            }
        });
    }

    /** 构建 MOVE_BACK：从「原位 + (offsetX, offsetY)」缓动回原位 */
    private static _buildMoveBack(node: Node, anim: UIAnimOption): Tween<any> {
        const duration = anim.duration ?? UIAnimator.DEFAULT_DURATION;
        const delay = anim.delay ?? 0;
        const offsetX = anim.offsetX ?? 0;
        const offsetY = anim.offsetY ?? 0;
        const easing = anim.easing ?? UIAnimator.DEFAULT_EASING;

        // 记录原位（含 z），动画全程只改 x/y，z 保持不变
        const origin = node.position.clone();
        const startX = origin.x + offsetX;
        const startY = origin.y + offsetY;
        node.setPosition(startX, startY, origin.z); // 立即复位到起点，避免衔接闪烁
        const proxy = { x: startX, y: startY };
        let tw: Tween<any> = tween(proxy);
        if (delay > 0) {
            tw = tw.delay(delay);
        }
        return tw.to(duration, { x: origin.x, y: origin.y }, {
            easing,
            onUpdate: (t: any) => {
                if (!UIAnimator._alive(node)) return;
                node.setPosition(t.x, t.y, origin.z);
            },
        }).call(() => {
            if (!node.isValid) return;
            node.setPosition(origin.x, origin.y, origin.z);
        });
    }

    // ==================== 内部工具 ====================

    /** 动画类型 -> 通道名（同通道互斥、跨通道可并行） */
    private static _channelOf(type: UIAnimType): string {
        switch (type) {
            case UIAnimType.SPIN:
                return UIAnimator.CH_ROTATION;
            case UIAnimType.COLOR:
                return UIAnimator.CH_COLOR;
            case UIAnimType.OPACITY:
                return UIAnimator.CH_OPACITY;
            case UIAnimType.MOVE_BACK:
                return UIAnimator.CH_POSITION;
            case UIAnimType.POP_IN:
            case UIAnimType.POP_OUT:
            default:
                return UIAnimator.CH_SCALE;
        }
    }

    private static _stopChannel(node: Node, channel: string): void {
        const tw = UIAnimator._tweens.get(node)?.[channel];
        if (tw) {
            tw.stop();
        }
    }

    /**
     * 停掉该节点上「所有通道」正在播放的 tween。
     * play() 重播前调用；遍历已记录的通道，新增动画类型/通道时无需再改这里。
     */
    private static _stopAllChannels(node: Node): void {
        const map = UIAnimator._tweens.get(node);
        if (!map) {
            return;
        }
        for (const channel in map) {
            map[channel]?.stop();
        }
    }

    private static _clearChannel(node: Node, channel: string): void {
        const map = UIAnimator._tweens.get(node);
        if (map) {
            map[channel] = undefined;
        }
    }

    private static _track(node: Node, channel: string, tw: Tween<any>): void {
        let map = UIAnimator._tweens.get(node);
        if (!map) {
            map = {};
            UIAnimator._tweens.set(node, map);
        }
        map[channel] = tw;
    }

    /**
     * 节点是否仍有效。无效（已被销毁）时顺手停掉该节点上所有动画（自愈兜底），返回 false。
     * 供各动画的 onUpdate / 结束回调早退使用：即使调用方忘了调用 stopAll，也不会继续逐帧写已销毁节点。
     */
    private static _alive(node: Node): boolean {
        if (node.isValid) {
            return true;
        }
        UIAnimator._stopAllChannels(node);
        return false;
    }

    /**
     * 停止并释放节点（默认含整棵子树）上由 UIAnimator 播放的所有动画。
     *
     * 为什么需要它：本工具用「代理对象」作为 tween 目标，引擎无法感知节点销毁并自动收尾，
     * 节点销毁后 tween 仍会逐帧 tick（白耗 CPU），且回调里对已销毁节点的写入会报错。
     * 在节点/组件的 onDestroy（或 UIBase 的 onDispose）里调用一次即可「立即停止 + 释放记录」。
     * （即便忘记调用，各动画 onUpdate 内的 isValid 兜底也会在下一帧自动停掉，不会长期空转/报错。）
     * @param node 目标节点
     * @param recursive 是否递归处理子节点（默认 true；动画常挂在子节点上，故整树清理）
     */
    public static stopAll(node: Node | null | undefined, recursive: boolean = true): void {
        if (!node) {
            return;
        }
        UIAnimator._stopAllChannels(node);
        UIAnimator._tweens.delete(node);
        if (recursive) {
            const children = node.children;
            if (children) {
                for (let i = 0; i < children.length; i++) {
                    UIAnimator.stopAll(children[i], true);
                }
            }
        }
    }

    /**
     * 立即对节点及其子树内所有 Widget 执行一次对齐（强制对齐一次，不受 Align Mode 限制）。
     * @param root 起始节点（含自身）
     */
    public static realign(root: Node | null | undefined): void {
        if (!root || !root.isValid) {
            return;
        }
        const widgets = root.getComponentsInChildren(Widget);
        for (const widget of widgets) {
            if (widget.isValid) {
                // 强制按当前父级尺寸对齐一次，无需依赖窗口 resize 事件
                widget.updateAlignment();
            }
        }
    }
}
