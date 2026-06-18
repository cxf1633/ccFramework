/**
 * Cocos 节点路径工具。
 *
 * 常用方法：
 * ```ts
 * // 场景完整路径，例如 HoldemPoker/UIRoot/gui/LayerUI/HoldemMain
 * NodePathUtils.getFullPath(node);
 *
 * // 相对某个 UI 根节点的路径，例如 HoldemMain/SeatRoot/Seat1
 * NodePathUtils.getRelativePath(childNode, this.node);
 *
 * // 打点路径；同名兄弟节点会带下标，例如 Canvas/List/Button[1]
 * NodePathUtils.getIndexedPath(buttonNode);
 * ```
 */

import { Node } from "cc";
/**
 * 节点路径生成参数。
 */
export interface NodePathOptions {
    /** 指定路径的根节点；不传时默认使用场景最顶层节点。 */
    root?: Node | null;
    /** 是否把根节点名称也拼进路径，默认 true。 */
    includeRoot?: boolean;
    /** 同名兄弟节点是否追加下标，例如 Button[2]，默认 false。 */
    includeSiblingIndex?: boolean;
}
export class NodePathUtils {
    /**
     * 获取从场景最顶层节点到目标节点的完整路径。
     */
    public static getFullPath(node: Node | null): string {
        return this.getPath(node);
    }

    /**
     * 获取目标节点相对指定根节点的路径。
     *
     * @param node 目标节点。
     * @param root 路径根节点。
     * @param includeRoot 是否包含 root 节点名称，默认包含。
     */
    public static getRelativePath(node: Node | null, root: Node, includeRoot: boolean = true): string {
        return this.getPath(node, { root, includeRoot });
    }

    /**
     * 获取打点用路径。
     *
     * 默认不包含场景最顶层节点，并且同名兄弟节点会追加下标，兼容旧的 ButtonClickTracking 行为。
     */
    public static getIndexedPath(node: Node | null, includeRoot: boolean = false): string {
        return this.getPath(node, { includeRoot, includeSiblingIndex: true });
    }

    /**
     * 从指定根节点开始，按相对路径查找子节点。
     */
    public static getChildByPath(root: Node | null | undefined, path: string): Node | null {
        const names = path.split("/").filter(Boolean);
        let current = root || null;
        if (current && names[0] === current.name) {
            names.shift();
        }

        for (const name of names) {
            current = current?.getChildByName(name) || null;
            if (!current) return null;
        }

        return current;
    }

    /**
     * 按参数生成节点路径。
     */
    public static getPath(node: Node | null, options: NodePathOptions = {}): string {
        const names: string[] = [];
        let current: Node | null = node;
        const includeRoot = options.includeRoot ?? true;

        while (current) {
            const isRoot = options.root ? current === options.root : current.parent == null;
            if (!isRoot || includeRoot) {
                names.unshift(this.getPathName(current, !!options.includeSiblingIndex));
            }

            if (isRoot) {
                break;
            }

            current = current.parent;
        }

        return names.join("/");
    }

    private static getPathName(node: Node, includeSiblingIndex: boolean): string {
        if (!includeSiblingIndex || !this.hasSameNameSiblings(node)) {
            return node.name;
        }

        return `${node.name}[${this.getSiblingIndex(node)}]`;
    }

    private static getSiblingIndex(node: Node): number {
        if (!node.parent) {
            return -1;
        }

        return node.parent.children.indexOf(node);
    }

    private static hasSameNameSiblings(node: Node): boolean {
        if (!node.parent) {
            return false;
        }

        return node.parent.children.filter((sibling) => sibling.name === node.name).length > 1;
    }
}
