/**
 * 时间格式化工具。
 *
 * 集中处理游戏内常见的时间展示与换算：
 * - 时长 / 倒计时文本：formatDuration（HH:mm:ss）、formatCountdown（mm:ss）；
 * - 日期时间文本：formatDate（yyyy-MM-dd hh:mm:ss 等 pattern）；
 * - 时间戳换算：toSeconds（兼容秒 / 毫秒）、daysBetween（间隔天数）。
 *
 * 常用写法：
 * ```ts
 * TimeUtils.formatDuration(3725);            // "01:02:05"
 * TimeUtils.formatDuration(0);               // "00:00:00"
 * TimeUtils.formatCountdown(90);             // "01:30"
 * TimeUtils.formatDate(1712131200, "hh:mm"); // "16:00"（秒级时间戳）
 * TimeUtils.toSeconds(1712131200000);        // 1712131200
 * TimeUtils.daysBetween("2026-08-05", new Date()); // 天数差
 * ```
 *
 * 说明：当前 TypeScript 目标不含 String.padStart，因此统一使用内部手工补位。
 */
export class TimeUtils {
    /** 毫秒时间戳判定阈值：>= 10^12 视为毫秒，否则视为秒。 */
    private static readonly MILLISECOND_THRESHOLD = 1_000_000_000_000;

    /**
     * 把可能是秒或毫秒的时间戳统一换算为秒。
     * 服务器时间戳常用秒，本地 Date 常用毫秒，因此按 10^12 阈值区分。
     */
    public static toSeconds(timestamp: number): number {
        return timestamp >= this.MILLISECOND_THRESHOLD
            ? Math.floor(timestamp / 1000)
            : Math.floor(timestamp);
    }

    /**
     * 时长格式化为 HH:mm:ss，小时可超过 24（如 120:30:05）。
     * 用于比赛已进行时间、多阶段总倒计时等可能超过 1 小时的场景。
     */
    public static formatDuration(totalSeconds: number): string {
        const total = Math.max(0, Math.floor(totalSeconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total % 3600 / 60);
        const seconds = total % 60;
        return `${this.pad2(hours)}:${this.pad2(minutes)}:${this.pad2(seconds)}`;
    }

    /**
     * 时长格式化为 mm:ss，分钟可超过 59。
     * 用于不超过 1 小时的倒计时，如盲注时间、CD 倒计时。
     */
    public static formatCountdown(totalSeconds: number): string {
        const total = Math.max(0, Math.floor(totalSeconds));
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${this.pad2(minutes)}:${this.pad2(seconds)}`;
    }

    /**
     * 日期时间按 pattern 格式化。
     *
     * @param time Date，或秒 / 毫秒级时间戳（自动归一化）。
     * @param pattern 支持 yyyy / yy / MM / dd / hh / mm / ss / ms，默认 "yyyy-MM-dd hh:mm:ss"。
     */
    public static formatDate(time: Date | number, pattern = "yyyy-MM-dd hh:mm:ss"): string {
        const date = time instanceof Date ? time : new Date(this.toSeconds(time) * 1000);
        const tokens: Record<string, string> = {
            yyyy: String(date.getFullYear()),
            yy: String(date.getFullYear()).slice(-2),
            MM: this.pad2(date.getMonth() + 1),
            dd: this.pad2(date.getDate()),
            hh: this.pad2(date.getHours()),
            mm: this.pad2(date.getMinutes()),
            ss: this.pad2(date.getSeconds()),
            ms: this.pad3(date.getMilliseconds()),
        };
        return pattern.replace(/yyyy|yy|MM|dd|hh|mm|ss|ms/g, (token) => tokens[token]);
    }

    /**
     * 两个时间的间隔天数（按日历日取绝对值，使用 UTC 归一化，跨时区 / 夏令时稳定）。
     * @param time2 缺省为当前时间。
     */
    public static daysBetween(time1: number | Date, time2: number | Date = new Date()): number {
        const start = new Date(time1);
        const end = new Date(time2);
        const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
        const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
        return Math.abs(endDay - startDay) / 86_400_000;
    }

    /** 两位补零，ES2015 兼容（不使用 String.padStart）。 */
    private static pad2(value: number): string {
        return value < 10 ? `0${value}` : String(value);
    }

    /** 三位补零。 */
    private static pad3(value: number): string {
        return value < 10 ? `00${value}` : value < 100 ? `0${value}` : String(value);
    }
}
