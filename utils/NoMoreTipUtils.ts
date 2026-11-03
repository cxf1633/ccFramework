import { Logger } from "../log/Logger";
import { StorageManager } from "../storage/StorageManager";
import { TimeUtils } from "./TimeUtils";

/**
 * 一条「不再提示」记录的唯一标识。
 *
 * 由业务侧自己定义（通常是一个 string 枚举），本工具只把它当字符串 key 用。
 */
export type NoMoreTipId = string;

/**
 * 「不再提示」记录工具。
 *
 * 只做一件事：记住玩家把哪些提示勾成了「不再提示」，并把这份记录持久化到本地存储。
 * 不依赖 UI、不依赖 `assets/script/app`、也不依赖任何具体业务，可以单独拷到别的工程用。
 *
 * **有效期默认是「永久」**：勾选一次就不再弹了，直到玩家在设置里清掉。
 * 需要别的有效期就显式传 `durationMs`，例如当天有效传 `DURATION_TODAY`。
 *
 * 弹不弹、弹出什么样的界面，都由调用方自己决定：
 * ```ts
 * const noMoreTip = Framework.NoMoreTipUtils;
 *
 * if (noMoreTip.isIgnored(MyTip.SignUp)) {
 *     doSignUp();
 *     return;
 * }
 * await app.notice.messageBox({ content: "报名后不可取消，是否继续？", okFunc: ... });
 *
 * // 玩家勾了「不再提示」并点了确定
 * noMoreTip.setIgnored(MyTip.SignUp, true);                                 // 默认永久有效
 * noMoreTip.setIgnored(MyTip.SignUp, true, NoMoreTipUtils.DURATION_TODAY);  // 只管当天
 * noMoreTip.setIgnored(MyTip.SignUp, true, 7 * 86400000);                   // 7 天
 * noMoreTip.setIgnored(MyTip.SignUp, true, NoMoreTipUtils.DURATION_FOREVER); // 显式写永久
 * ```
 *
 * 存储：localStorage 的 `STORAGE_KEY` 里放一个 JSON，形如 `{ "SignUp": 到期时间戳 }`，
 * 其中 `0` 表示永久。过期的项在读取时按未勾选处理，并在下一次写入或 `clearExpired()` 时从存储里清掉。
 * 首次访问时懒加载，不需要任何初始化调用。
 */
export class NoMoreTipUtils {
    /** 本地存储 key；改这个值会让玩家已经保存的记录失效。 */
    public static readonly STORAGE_KEY = "framework_no_more_tip";

    /** `setIgnored` 的有效时长：永久有效（不过期），也是不传 `durationMs` 时的默认值。 */
    public static readonly DURATION_FOREVER = Infinity;

    /**
     * `setIgnored` 的有效时长：只管当天（到今天 23:59:59.999），过了零点自动失效。
     *
     * 这是个哨兵值，**必须用常量，不要手写 -1**：其他 ≤0 的时长都按「永久」处理。
     */
    public static readonly DURATION_TODAY = -1;

    /** 永久有效的到期时间戳，也是存进本地存储的值。 */
    private static readonly EXPIRE_FOREVER = 0;

    /** 内存缓存；`null` 表示还没从本地存储读过。key 为提示 ID，值为到期时间戳。 */
    private static ignoreMap: Record<string, number> | null = null;

    /**
     * 这条提示当前是否有效（已勾选且没过期）。
     *
     * @param now 判定时间，缺省为当前时间；便于测试时传一个假时间。
     */
    public static isIgnored(id: NoMoreTipId, now: number = Date.now()): boolean {
        return this.isIgnoredIn(this.getIgnoreMap(), id, now);
    }

    /**
     * 写入 / 取消一条「不再提示」记录，并立即持久化。
     *
     * @param durationMs 有效时长（毫秒）。
     *                   不传 = **永久有效**（默认）；
     *                   `DURATION_TODAY` = 当天有效（到今天 23:59:59）；
     *                   正数 = 该毫秒数；
     *                   `DURATION_FOREVER` 或任意其它 ≤0 / 非有限数 = 永久有效。
     */
    public static setIgnored(id: NoMoreTipId, ignored: boolean, durationMs?: number): void {
        if (!id) {
            Logger.warn("[NoMoreTipUtils] id is required.");
            return;
        }

        const map = this.getIgnoreMap();
        if (ignored) {
            map[id] = this.resolveExpireAt(durationMs);
        } else {
            delete map[id];
        }

        this.saveIgnoreMap(map);
    }

    /** 清掉某一条记录（等同于 `setIgnored(id, false)`）。 */
    public static clear(id: NoMoreTipId): void {
        this.setIgnored(id, false);
    }

    /** 清掉全部记录。 */
    public static clearAll(): void {
        this.saveIgnoreMap({});
    }

    /** 清掉已经过期的记录；有变化时才写存储。 */
    public static clearExpired(now: number = Date.now()): void {
        const map = this.getIgnoreMap();
        let changed = false;

        Object.keys(map).forEach((id) => {
            if (this.isExpired(map[id], now)) {
                delete map[id];
                changed = true;
            }
        });

        if (changed) {
            this.saveIgnoreMap(map);
        }
    }

    /** 当前仍然有效的「不再提示」ID 列表（已过滤过期项）。 */
    public static getIgnoredIds(now: number = Date.now()): string[] {
        const map = this.getIgnoreMap();
        return Object.keys(map).filter((id) => this.isIgnoredIn(map, id, now));
    }

    /** 是否有任意一条仍然有效的「不再提示」记录。 */
    public static get hasIgnored(): boolean {
        return this.getIgnoredIds().length > 0;
    }

    /** 测试用：清掉内存缓存，下次访问重新从本地存储加载。 */
    public static resetCache(): void {
        this.ignoreMap = null;
    }

    private static isIgnoredIn(map: Record<string, number>, id: NoMoreTipId, now: number): boolean {
        if (!id) {
            return false;
        }

        const expireAt = map[id];
        if (expireAt === undefined) {
            return false;
        }

        return !this.isExpired(expireAt, now);
    }

    /** 到期时间 `<= now` 视为过期；`0`（永久）永不过期。 */
    private static isExpired(expireAt: number, now: number): boolean {
        return expireAt !== this.EXPIRE_FOREVER && expireAt <= now;
    }

    /** 把「有效时长」换算成到期时间戳；`0` 表示永久。 */
    private static resolveExpireAt(durationMs?: number): number {
        // 不传 = 默认永久有效。
        if (durationMs === undefined) {
            return this.EXPIRE_FOREVER;
        }

        // 显式要「当天有效」：到今天 23:59:59.999。
        if (durationMs === this.DURATION_TODAY) {
            return TimeUtils.getTodayEndTime();
        }

        // 其余 ≤0 / 非有限数（含 DURATION_FOREVER）都按永久处理。
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            return this.EXPIRE_FOREVER;
        }

        return Date.now() + durationMs;
    }

    private static getIgnoreMap(): Record<string, number> {
        if (!this.ignoreMap) {
            this.ignoreMap = this.loadIgnoreMap();
        }

        return this.ignoreMap;
    }

    private static loadIgnoreMap(): Record<string, number> {
        try {
            const raw = StorageManager.getInstance().getItem(this.STORAGE_KEY);
            if (!raw) {
                return {};
            }

            const data = JSON.parse(raw);
            if (!data || typeof data !== "object" || Array.isArray(data)) {
                return {};
            }

            // 只认非负数字的到期时间戳，脏数据直接丢弃。
            const map: Record<string, number> = {};
            Object.keys(data).forEach((key) => {
                const expireAt = data[key];
                if (typeof expireAt === "number" && Number.isFinite(expireAt) && expireAt >= 0) {
                    map[key] = expireAt;
                }
            });
            return map;
        } catch (err) {
            Logger.warn("[NoMoreTipUtils] parse local storage failed.", err);
            return {};
        }
    }

    private static saveIgnoreMap(map: Record<string, number>): void {
        // 先更新内存，写盘失败也不影响本次运行的判断。
        this.ignoreMap = map;
        try {
            StorageManager.getInstance().setItem(this.STORAGE_KEY, JSON.stringify(map));
        } catch (err) {
            Logger.warn("[NoMoreTipUtils] save local storage failed.", err);
        }
    }
}
