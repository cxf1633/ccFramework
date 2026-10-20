import { Node, Color, UIRenderer, Sprite } from "cc";

/**
 * 灰态工具（GrayUtils）
 *
 * 方案说明（相对旧版的三次修复，本轮彻底改为官方 grayscale 方案）：
 * 旧版"运行时用 IS_GRAY 宏动态建材质 + customMaterial"存在两个顽固问题：
 * a. 隐藏/显示（onEnable）时 Sprite._activateMaterial 会用组件 grayscale 状态(false)重编译材质宏，
 *    把 customMaterial 上的 IS_GRAY 关掉 → 灰态丢失，只剩颜色压暗；
 * b. 进入游戏时若材质尚未就绪，动态灰度材质创建失败且无自动补灰机制 → "有时候没完全灰"。
 *
 * 现改为：
 * 1. Sprite：使用官方 grayscale 属性。灰态状态保存在组件上，隐藏/显示、材质就绪后
 *    引擎都会按 grayscale=true 自动重编译灰度宏，灰态不会丢失，也无需手动建材质/管宏。
 * 2. Label、Graphics 等非 Sprite 渲染器（无 grayscale 属性）：降级为颜色压暗 grayColor，
 *    颜色是组件属性，隐藏/显示不会重置，灰态同样保持。
 * 3. 置灰时统一将 renderer.color 压暗为 grayColor（默认 200,200,200，与原实现视觉一致），
 *    与灰度叠加避免过亮；恢复时还原原色。
 * 4. 不再运行时 new Material / 不检测宏 / 不替换 customMaterial，无材质泄漏，效率更高。
 *
 * 注意：grayscale 会实例化材质（IS_GRAY 宏与普通材质不同）→ 灰态节点脱离合批，DrawCall 上升，
 *       这是灰度方案的固有成本；若灰态节点很多且在意 DC，可考虑仅颜色压暗（不换材质）。
 */

const ORIGIN_COLOR_KEY = "__game_utils_origin_color__";
const IS_GRAYING_KEY = "__game_utils_is_graying__";
const USED_GRAYSCALE_KEY = "__game_utils_used_grayscale__";

export class GrayUtils {

    /** 置灰时应用的压暗色（灰度 shader 与仅压暗降级路径统一使用，避免灰态过亮），可按项目视觉自行调整 */
    static grayColor: Color = new Color(200, 200, 200, 255);

    static setGray(targetNode: Node, isGray: boolean, includeChildren: boolean = true) {
        if (!targetNode || !targetNode.isValid) return;

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
                this.setGray(children[i], isGray, includeChildren);
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
}
