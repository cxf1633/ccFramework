import { Node, Color, UIOpacity, UIRenderer, Sprite } from "cc";

/**
 * 灰态工具（GrayUtils）
 *
 * 支持两种灰态方式，用 `GrayMode` 选，默认灰度（方案 1）：
 *
 * 方案 1（默认）灰度 —— `GrayMode.Grayscale`
 *   Sprite 用官方 grayscale 属性（内部切 IS_GRAY 宏材质实例），非 Sprite 渲染器
 *   （Label、Graphics 等，无 grayscale 属性）降级为颜色压暗 grayColor；两者都会再压暗颜色。
 *   相对旧版"运行时用 IS_GRAY 宏动态建材质 + customMaterial"，这一版没有两个顽固问题：
 *   a. 隐藏/显示（onEnable）时 Sprite._activateMaterial 会用组件 grayscale 状态(false)重编译材质宏，
 *      把 customMaterial 上的 IS_GRAY 关掉 → 灰态丢失，只剩颜色压暗；
 *   b. 进入游戏时若材质尚未就绪，动态灰度材质创建失败且无自动补灰机制 → "有时候没完全灰"。
 *   现在灰态状态存在组件上（grayscale / color），隐藏/显示、材质晚就绪后引擎都会按状态恢复，
 *   也无需手动建材质、管宏、换 customMaterial，无材质泄漏。
 *   代价：grayscale 会实例化材质（IS_GRAY 宏与普通材质不同）→ 灰态节点脱离合批，DrawCall 上升。
 *
 * 方案 2 透明度 —— `GrayMode.Opacity`
 *   只给目标节点挂/取用 `UIOpacity`，把 opacity 设成 `grayOpacity`（默认 128 ≈ 50%），
 *   颜色、材质、grayscale 一律不动，因此不产生材质实例、不影响合批，DrawCall 不变。
 *   透明度会按引擎的级联规则向下继承（batcher 逐层乘 localOpacity），所以**只在目标节点设一次**，
 *   子节点自动跟着半透明；不要再逐个子节点设，否则父子叠乘会变成 25%。
 *   注意：它和父级 / 自身已有的透明度是相乘关系（父级 50% + 本次 50% = 25%），
 *   且 `UIOpacity.onDisable` 会把 localOpacity 复位为 1、`onEnable` 再按 `_opacity` 同步回来
 *   （`_opacity` 本身不清），所以节点反复隐藏/显示灰态不会丢。
 *
 * 用法：
 *   置灰：`GrayUtils.setGray(node, true)`                          // 默认灰度
 *         `GrayUtils.setGray(node, true, true, GrayMode.Opacity)`  // 50% 透明
 *   恢复：`GrayUtils.setGray(node, false)`                         // 不分方式，两条路径都还原
 *   全局改默认：`GrayUtils.defaultMode = GrayMode.Opacity`（或只改 `GrayUtils.grayOpacity` 调深浅）
 */

/**
 * 灰态方式。数值与需求口径对齐：1 = 灰度（原方案），2 = 透明度。
 */
export enum GrayMode {
    /** 1 = 灰度（默认）：Sprite 官方 grayscale + 颜色压暗；非 Sprite 渲染器降级为压暗 */
    Grayscale = 1,
    /** 2 = 透明度：只改目标节点的 UIOpacity（默认 50%），颜色/材质都不动 */
    Opacity = 2,
}

const ORIGIN_COLOR_KEY = "__game_utils_origin_color__";
const IS_GRAYING_KEY = "__game_utils_is_graying__";
const USED_GRAYSCALE_KEY = "__game_utils_used_grayscale__";
const ORIGIN_OPACITY_KEY = "__game_utils_origin_opacity__";
const IS_OPACITY_GRAYING_KEY = "__game_utils_is_opacity_graying__";

export class GrayUtils {

    /** 置灰时应用的压暗色（灰度 shader 与仅压暗降级路径统一使用，避免灰态过亮），可按项目视觉自行调整 */
    static grayColor: Color = new Color(200, 200, 200, 255);

    /**
     * 透明度模式使用的透明度（0-255）。
     * 50% ≈ 128（255 * 0.5 = 127.5，取 128 让视觉正好是「一半」），可按项目视觉自行调整。
     */
    static grayOpacity: number = 128;

    /**
     * 全局默认灰态方式：调用方不传 mode 时用它。
     * 默认方案 1（灰度）；想整项目切成透明度就改这里，或每次调用显式传 `GrayMode.Opacity`。
     */
    static defaultMode: GrayMode = GrayMode.Grayscale;

    /**
     * 设置 / 取消灰态。
     *
     * @param targetNode 目标节点
     * @param isGray true 置灰 / false 恢复
     * @param includeChildren 仅灰度模式生效：是否递归子节点。
     *        透明度模式只处理 targetNode 本身（透明度由引擎向下级联继承），忽略此参数
     * @param mode 灰态方式，默认取 `GrayUtils.defaultMode`（灰度）。
     *        **只影响置灰；取消灰态时两条路径都会还原**，切换方式后也不会残留半灰
     */
    static setGray(targetNode: Node, isGray: boolean, includeChildren: boolean = true, mode: GrayMode = GrayUtils.defaultMode): void {
        if (!targetNode || !targetNode.isValid) return;

        if (isGray && mode === GrayMode.Opacity) {
            // 透明度模式：只处理根节点。子节点由引擎按 localOpacity 逐层相乘自动继承，
            // 这里再递归就会父子各乘一次（50% * 50% = 25%），所以直接返回。
            this._applyOpacityGray(targetNode);
            return;
        }

        if (!isGray) {
            // 取消不分方式：先撤回透明度，再按渲染器撤回灰度。这样调用方先灰度置灰、后换成
            // 透明度方式恢复（或反过来）也不会留下"半灰"——两种路径各自认自己的状态键，没设过就是空操作。
            this._revertOpacityGray(targetNode);
        }

        const renderer = targetNode.getComponent(UIRenderer);
        if (renderer) {
            if (isGray) {
                this._applyGray(renderer);
            } else {
                this._revertGray(renderer);
            }
        }

        if (includeChildren) {
            const children = targetNode.children.slice();
            for (let i = 0; i < children.length; i++) {
                this.setGray(children[i], isGray, includeChildren, mode);
            }
        }
    }

    private static _applyGray(renderer: UIRenderer) {
        if (!renderer.isValid) return;
        const rAny = renderer as any;

        // 首次进入灰态：记录原颜色（仅记录一次，重复调用不覆盖）
        if (!rAny[IS_GRAYING_KEY]) {
            rAny[ORIGIN_COLOR_KEY] = renderer.color.clone();
            rAny[IS_GRAYING_KEY] = true;
        }

        // Sprite：官方 grayscale（内部以材质实例切换 IS_GRAY 宏，状态存组件上，隐藏/显示不丢灰）
        if (renderer instanceof Sprite) {
            renderer.grayscale = true;
            rAny[USED_GRAYSCALE_KEY] = true;
        }

        // 统一压暗颜色：SPRITE/LABEL 置灰后均为 grayColor，恢复时还原原色
        renderer.color = GrayUtils.grayColor;
        renderer.markForUpdateRenderData();
    }

    private static _revertGray(renderer: UIRenderer) {
        if (!renderer.isValid) return;
        const rAny = renderer as any;
        if (!rAny[IS_GRAYING_KEY]) return;

        // 仅当置灰时设置过 grayscale 才恢复，避免误关美术原本就开启的灰度
        if (rAny[USED_GRAYSCALE_KEY] && renderer instanceof Sprite) {
            renderer.grayscale = false;
        }
        // 恢复原颜色（Sprite 与 Label 置灰时均统一压暗过 grayColor）
        if (rAny[ORIGIN_COLOR_KEY]) {
            renderer.color = rAny[ORIGIN_COLOR_KEY];
        }
        renderer.markForUpdateRenderData();

        rAny[IS_GRAYING_KEY] = false;
        rAny[USED_GRAYSCALE_KEY] = false;
    }

    /**
     * 透明度置灰（方案 2）：把目标节点的 UIOpacity 调到 `grayOpacity`。
     *
     * - 节点没有 UIOpacity 就补一个（`@disallowMultiple`，先取再补）；恢复后只把值还原成 255，
     *   组件留着复用，避免置灰/恢复反复 add/remove。
     * - 原透明度只在第一次进入灰态时记一次，重复调用 `setGray(true)` 不会把半透明当原值存进去。
     * - 节点未激活时 setter 只同步 localOpacity，真正生效由组件 onEnable 按 `_opacity` 再同步一次，
     *   所以这里不需要额外处理；节点已激活时 setter 会标脏并在下一帧重绘。
     */
    private static _applyOpacityGray(node: Node): void {
        const state = node as any;

        let opacity = node.getComponent(UIOpacity);
        if (!opacity) {
            opacity = node.addComponent(UIOpacity);
        }

        if (!state[IS_OPACITY_GRAYING_KEY]) {
            // 新补的组件此时是 255，恢复时还原成 255，视觉与"没挂组件"一致
            state[ORIGIN_OPACITY_KEY] = opacity.opacity;
            state[IS_OPACITY_GRAYING_KEY] = true;
        }

        opacity.opacity = GrayUtils.grayOpacity;
    }

    /** 撤销透明度置灰：还原到置灰前的值；没走过透明度置灰就是空操作。 */
    private static _revertOpacityGray(node: Node): void {
        const state = node as any;
        if (!state[IS_OPACITY_GRAYING_KEY]) return;

        const opacity = node.getComponent(UIOpacity);
        if (opacity?.isValid) {
            const origin = state[ORIGIN_OPACITY_KEY];
            opacity.opacity = typeof origin === 'number' ? origin : 255;
        }

        state[IS_OPACITY_GRAYING_KEY] = false;
    }
}
