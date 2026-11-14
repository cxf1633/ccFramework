import { message } from '../../event/MessageManager';
import { RedPointType } from './RedPointType';

export { RedPointType } from './RedPointType';

/**
 * 红点数量更新事件名。
 *
 * 派发数据为 RedPointUpdateData；数据为 null 时表示需要全量刷新。
 */
export const RED_POINT_UPDATE_EVENT = 'redPointUpdate';

/** 红点更新事件的数据 */
export interface RedPointUpdateData {
    /** 变化的红点类型 */
    type: RedPointType;
    /** 当前红点数量 */
    count: number;
}

/**
 * 红点管理器
 *
 * 负责「按类型存数量 + 广播变化」，红点类型见 RedPointType。
 */
export class RedPointManager {

    private static _instance: RedPointManager = null!;

    public static getInstance(): RedPointManager {
        if (!this._instance) {
            this._instance = new RedPointManager();
        }
        return this._instance;
    }

    /**
     * 红点数据
     */
    private _redPointMap: Map<RedPointType, number> = new Map();

    private constructor() {
        this.init();
    }

    /**
     * 初始化：所有红点数量置 0
     */
    init() {

        for (const key in RedPointType) {

            // 排除字符串 key
            if (isNaN(Number(key))) {
                continue;
            }

            this._redPointMap.set(Number(key), 0);
        }
    }

    /**
     * 设置红点数量
     * @param type 红点类型
     * @param count 数量，小于 0 按 0 处理
     * @param emit 是否派发更新事件
     */
    setRedPointCount(type: RedPointType, count: number, emit: boolean = true) {

        count = Math.max(0, count);

        this._redPointMap.set(type, count);

        if (emit) {
            this._emit(type);
        }
    }

    /**
     * 增加红点
     */
    addRedPoint(type: RedPointType, value: number = 1) {

        const cur = this.getRedPointCount(type);

        this.setRedPointCount(type, cur + value);
    }

    /**
     * 减少红点
     */
    subRedPoint(type: RedPointType, value: number = 1) {

        const cur = this.getRedPointCount(type);

        this.setRedPointCount(type, Math.max(0, cur - value));
    }

    /**
     * 清除红点
     */
    clearRedPoint(type: RedPointType) {

        this.setRedPointCount(type, 0);
    }

    /**
     * 获取红点数量
     */
    getRedPointCount(type: RedPointType): number {

        return this._redPointMap.get(type) || 0;
    }

    /**
     * 是否有红点
     */
    hasRedPoint(type: RedPointType): boolean {

        return this.getRedPointCount(type) > 0;
    }

    /**
     * 获取所有红点总数（不含 None）
     */
    getAllRedPointCount(): number {

        let total = 0;

        this._redPointMap.forEach((count, type) => {

            if (type === RedPointType.None) {
                return;
            }

            total += count;
        });

        return total;
    }

    /**
     * 清空所有红点
     */
    clearAll() {

        this._redPointMap.forEach((v, k) => {
            this._redPointMap.set(k, 0);
        });

        this._emitAll();
    }

    /**
     * 派发单个更新事件
     */
    private _emit(type: RedPointType) {

        const data: RedPointUpdateData = {
            type,
            count: this.getRedPointCount(type),
        };

        message.dispatchMessage(RED_POINT_UPDATE_EVENT, data);
    }

    /**
     * 派发全部更新
     */
    private _emitAll() {

        message.dispatchMessage(RED_POINT_UPDATE_EVENT, null);
    }
}
