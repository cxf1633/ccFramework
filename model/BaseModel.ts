/**
 * 数据模型基类。
 *
 * Model 负责管理运行时数据，不直接操作 UI、场景或动画。
 */
export abstract class BaseModel {
    /** 清理当前缓存数据。 */
    public abstract clear(): void;
}
