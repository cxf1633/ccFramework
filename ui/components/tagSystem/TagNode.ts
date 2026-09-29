import { _decorator, CCString, Component } from "cc";

const { ccclass, property } = _decorator;

/**
 * 一个「标签域」下的一组标签名。
 *
 * 一套标签系统 = 一个域（domain）。名字随便取，两套系统之间即使标签重名也不会打架，
 * 因为 TagGroup 只认自己域里的那一条配置（见 TagGroup.refresh）。
 *
 * 标签名只是**给开发在看面板时看的说明文字**，不参与业务逻辑：
 * 面板上看到的就是这里填的字符串，改名字不需要动任何代码，也不影响任何取值。
 *
 * 序列化后形如：
 * ```text
 * TagNode
 *   tagEntries
 *     [0] domain: GameMode   tags: [德州, 奥马哈]   always: false
 *     [1] domain: RoomType   tags: [密码局]         always: false
 * ```
 * 表示这个节点同时挂在「玩法」和「房间类型」两套标签系统下。
 */
@ccclass("TagEntry")
export class TagEntry {
    @property({
        type: String,
        tooltip: "标签域 id：一套标签系统一个域，必须和某个 TagGroup 的 domain 完全一致才会被它控制",
    })
    public domain: string = "";

    @property({
        type: [CCString],
        tooltip: "标签名列表，名字可自定义（只是给人看的说明文字），例如 [\"德州\", \"奥马哈\"]\n其中任意一个等于 TagGroup.activeTagName 时该节点显示",
    })
    public tags: string[] = [];

    @property({ tooltip: "勾选后：该域切换标签时始终显示（该域的公共节点）" })
    public always: boolean = false;

    /** 在指定激活标签下，这条配置是否要求节点显示。 */
    public match(activeTagName: string): boolean {
        return this.always || this.tags.indexOf(activeTagName) >= 0;
    }
}

/**
 * 标签节点组件，挂载到需要受标签控制的任意节点上，按「标签域」标记它属于哪套标签系统。
 *
 * TagGroup 遍历自身子树的 TagNode 来控制显隐，不需要全局静态池，
 * 因此不同界面、同一界面里的多套标签系统都互不干扰，节点销毁时也无引用残留。
 *
 * 同一个界面里有 2 套互不关联的标签系统：
 * 1. 两套系统各取一个域 id（例如 `GameMode` / `RoomType`），填在 TagGroup 和 TagNode 上；
 * 2. TagGroup 只改同域 TagNode 的显隐，另一个域的节点一个都不碰；
 * 3. 一个节点若同时属于两套系统，在 tagEntries 里加两条即可（不需要挂两个组件）。
 *
 * 可继承此类扩展自定义逻辑。
 *
 * @example
 * ```ts
 * // 继承 TagNode 添加自定义数据
 * export class MyTagNode extends TagNode {
 *     public extraData: string = "";
 * }
 * ```
 */
@ccclass("TagNode")
export class TagNode extends Component {
    @property({
        type: [TagEntry],
        tooltip: "按标签域分组的标签配置，面板上直接填标签名\n一个节点可以同时属于多套标签系统，互不影响",
    })
    public tagEntries: TagEntry[] = [];

    /**
     * 取指定域的标签配置。
     * 返回 null 表示这个节点不属于该域，TagGroup 会直接跳过它（这是多套标签系统互不关联的关键）。
     */
    public getTagEntry(domain: string): TagEntry | null {
        if (!domain) {
            return null;
        }

        for (let i = 0, len = this.tagEntries.length; i < len; i++) {
            const entry = this.tagEntries[i];
            if (entry && entry.domain === domain) {
                return entry;
            }
        }

        return null;
    }
}
