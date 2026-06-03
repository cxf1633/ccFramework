/**
 * 数据缓存基类。
 *
 * Store 只负责保存和清理运行时数据，不直接操作 UI、场景、动画或网络连接。
 */
export abstract class BaseStore {
    private _version = 0;

    public get version(): number {
        return this._version;
    }

    /** 清理当前缓存数据。 */
    public abstract clear(): void;

    /** 标记缓存发生变化。 */
    protected touch(): void {
        this._version++;
    }

    /** 重置缓存版本号。 */
    protected resetVersion(): void {
        this._version = 0;
    }
}
