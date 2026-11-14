import { _decorator, Component, Enum, Label, Node } from 'cc';
import { message } from '../../event/MessageManager';
import { RED_POINT_UPDATE_EVENT, RedPointManager, RedPointType, RedPointUpdateData } from './RedPointManager';

const { ccclass, property } = _decorator;

/** 数量超过该值后统一显示 99+。 */
const MAX_SHOW_COUNT = 99;

/**
 * 红点组件
 *
 * 两种用法：
 * 1. 管理器驱动：redPointType 选一个类型，组件订阅 RedPointManager 的数量变化；
 * 2. 外部驱动：redPointType 保持 None，由外部代码调用 setCount(count) 直接设置数量
 *    （不进管理器、不需要类型，预制体上不用配任何红点类型）。
 */
@ccclass('RedPoint')
export class RedPoint extends Component {

    @property(Node)
    private redIcon: Node = null!;
    @property(Label)
    private numLabel: Label = null!;

    @property({ type: Enum(RedPointType), tooltip: "消息类型；外部驱动时保持 None" })
    redPointType: RedPointType = RedPointType.None;

    /** 消息监听的反注册函数 */
    private _off: (() => void) | null = null;

    /** 当前显示的数量（外部驱动时用于重新启用后保持） */
    private _count: number = 0;

    protected onEnable(): void {

        // 无类型：不做管理器订阅，完全由外部 setCount 驱动
        if (this.redPointType === RedPointType.None) {
            this.applyCount(this._count);
            return;
        }

        this._off = message.on(RED_POINT_UPDATE_EVENT, this.updateData, this);

        // 节点显示时先用管理器里的最新数量刷新一次
        this.refresh();
    }

    protected onDisable(): void {

        this._off?.();
        this._off = null;
    }

    /**
     * 无类型设置接口（供外部调用）
     *
     * 不依赖 redPointType、也不经过 RedPointManager，直接按数量显示：
     * 0 隐藏，1~99 显示数字，超过 99 显示 99+。
     * 组件配置了 redPointType 时，管理器的下一次刷新会覆盖这里设置的值。
     */
    public setCount(count: number): void {

        this.applyCount(Math.max(0, Math.floor(count || 0)));
    }

    /**
     * 当前显示的数量
     */
    public getCount(): number {

        return this._count;
    }

    /**
     * 按管理器中当前的数量刷新
     */
    public refresh(): void {

        this.applyCount(RedPointManager.getInstance().getRedPointCount(this.redPointType));
    }

    /**
     * 红点数据更新回调
     * @param _event 事件名
     * @param data 事件数据，为 null 时表示全量刷新
     */
    public updateData(_event: string, data: RedPointUpdateData | null): void {

        // 全量刷新
        if (!data) {
            this.refresh();
            return;
        }

        if (data.type !== this.redPointType) {
            return;
        }

        this.applyCount(data.count);
    }

    /**
     * 应用红点数量
     */
    private applyCount(count: number): void {

        this._count = count;

        const show = count > 0;

        if (this.redIcon) {
            this.redIcon.active = show;
        }

        // redPoint 预制体里数字节点和红点底板是平级节点，数量为 0 时两个节点都要隐藏
        const numLabelNode = this.numLabel?.node;
        if (numLabelNode && numLabelNode !== this.redIcon) {
            numLabelNode.active = show;
        }

        if (show && this.numLabel) {
            this.numLabel.string = count > MAX_SHOW_COUNT ? `${MAX_SHOW_COUNT}+` : `${count}`;
        }
    }
}
