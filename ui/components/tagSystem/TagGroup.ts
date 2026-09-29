import { _decorator, Component, Node } from "cc";
import { TagNode } from "./TagNode";

const { ccclass, property } = _decorator;

/**
 * 标签组管理器，根据当前激活的标签控制**指定节点子树内、同一个标签域**的 TagNode 显隐。
 *
 * 一套标签系统 = 一个域（domain），互不关联的多套系统靠 domain 隔开：
 * - 只处理 TagNode 上 domain 与自身相同的那一条配置，别的域的节点一个都不碰，
 *   所以切换 A 系统的标签不会动 B 系统的节点（见 refresh）；
 * - 标签值是字符串（名字可自定义），面板上直接看到名称；名字只是给人看的说明文字，
 *   不参与业务逻辑，改名不需要动代码；
 * - searchNode 指定搜索范围节点，不设置则默认搜索自身节点；
 * - 节点销毁时无静态引用残留，不影响 GC。
 *
 * 使用方式（以「玩法」这套标签为例）：
 * 1. 一套标签系统挂 N 个 TagGroup（N = 该系统的标签个数），各自填 domain + activeTagName，
 *    通常由 UIToggleGroup 激活对应节点，靠 onEnable -> refresh() 生效；
 * 2. 需要受控的节点挂 TagNode，在 tagEntries 里加一条 `{ domain, tags }`；
 * 3. 运行时调用 tagGroup.setActiveTagName("德州") 切换显隐。
 */
@ccclass("TagGroup")
export class TagGroup extends Component {
    @property({ type: Node, tooltip: "指定搜索 TagNode 的根节点，不设置则默认搜索自身节点" })
    public searchNode: Node | null = null;

    @property({
        type: String,
        tooltip: "标签域 id：一套标签系统一个域，只控制 TagNode.tagEntries 里同域的配置\n留空则本组件不会控制任何节点",
    })
    public domain: string = "";

    @property({
        type: String,
        tooltip: "当前激活的标签名，例如「德州」\n要和 TagNode.tagEntries[].tags 里填的名字完全一致（大小写、空格都算）",
    })
    public activeTagName: string = "";

    /** 配置自检只跑一次（节点会被反复 enable，避免刷屏） */
    private checkedConfig: boolean = false;

    protected onEnable(): void {
        this.checkConfig();
        this.refresh();
    }

    /**
     * 切换到指定标签名，同步刷新同域 TagNode 的显隐
     */
    public setActiveTagName(tagName: string): void {
        if (this.activeTagName === tagName) return;
        this.activeTagName = tagName;
        this.refresh();
    }

    /**
     * 强制刷新同域 TagNode 的显隐（通常无需手动调用）
     */
    public refresh(): void {
        const root = this.searchNode || this.node;
        if (!root?.isValid) return;

        const tagNodes = root.getComponentsInChildren(TagNode);

        for (let i = 0, len = tagNodes.length; i < len; i++) {
            const tagNode = tagNodes[i];
            if (!tagNode?.isValid) continue;

            const entry = tagNode.getTagEntry(this.domain);
            // 不是自己这套标签系统的节点，一点都不碰（多套系统互不关联就靠这一行）
            if (!entry) continue;

            tagNode.node.active = entry.match(this.activeTagName);
        }
    }

    /**
     * 配置自检：把「面板上看着配好了、其实不会生效」的几种情况打成警告，每个组件只打一次。
     */
    private checkConfig(): void {
        if (this.checkedConfig) return;
        this.checkedConfig = true;

        const root = this.searchNode || this.node;
        if (!root?.isValid) return;

        if (this.domain.length === 0) {
            console.warn(`[TagGroup] ${this.node.name} 的 domain 为空，不会控制任何节点；`
                + `请填上与 TagNode.tagEntries[].domain 一致的标签域`);
            return;
        }

        if (this.activeTagName.length === 0) {
            console.warn(`[TagGroup] ${this.node.name} 域「${this.domain}」的 activeTagName 为空，`
                + `该域下所有节点都会被隐藏`);
        }

        root.getComponentsInChildren(TagNode).forEach((tagNode) => {
            if (!tagNode?.isValid) return;

            const entry = tagNode.getTagEntry(this.domain);
            if (entry && entry.tags.length === 0 && !entry.always) {
                console.warn(`[TagGroup] ${this.node.name} 域「${this.domain}」下的 ${tagNode.node.name} `
                    + `标签名为空，该节点会被隐藏`);
            }
        });
    }
}
