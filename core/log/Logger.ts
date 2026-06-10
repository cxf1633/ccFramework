import { error } from "cc";
import { log } from "cc";

/** 日志类型 */
export enum LogType {
    /** 标准日志 */
    Log = 1,
    /** 警告日志 */
    Warn = 2,
    /** 错误日志 */
    Error = 4,
}

/** 日志颜色 */
export enum LogColor {
    /** 默认白色 */
    Default = "color:#ffffff;",
    /** 橙色 */
    Orange = "color:#ee7700;",
    /** 紫色 */
    Purple = "color:Violet;",
    /** 蓝色 */
    Blue = "color:#3a5fcd;",
    /** 绿色 */
    Green = "color:green;",
    /** 灰色 */
    Gray = "color:gray;",
    /** 红色 */
    Red = "color:#ff0000;",
}

/**
 * 日志管理
 * @example
app.log("默认日志");
app.warn("警告日志");
app.error("错误日志");
 */
export class Logger {
    private static debug: boolean = true;

    /** 设置是否开启日志 */
    static setDebug(debug: boolean) {
        this.debug = debug;
    }

    /**
     * 打印网络日志
     * @param args 日志参数
     */
    static netLog(...args: any[]) {
        if (!this.debug) {
            return;
        }
        this.print(args, LogColor.Green);
    }

    /**
     * 打印标准日志
     * @param args 日志参数
     */
    static log(...args: any[]) {
        if (!this.debug) {
            return;
        }
        this.print(args, LogColor.Blue);
    }

    /**
     * 打印对象快照日志
     * @param args 日志参数
     */
    static logJson(...args: any[]) {
        if (!this.debug) {
            return;
        }
        this.print(args.map(arg => this.safeStringify(arg)), LogColor.Gray);
    }

    /**
     * 打印警告日志
     * @param args 日志参数
     */
    static warn(...args: any[]) {
        if (!this.debug) {
            return;
        }
        this.print(args, LogColor.Orange);
    }

    /**
     * 打印错误日志
     * @param args 日志参数
     */
    static error(...args: any[]) {
        this.print(args, LogColor.Red);
    }

    /**
     * 输出日志
     * @param args 日志参数
     * @param color 日志文本颜色
     */
    private static print(args: any[], color: string) {
        const backLog = color == LogColor.Red ? error : log;
        const timeStr = this.getDateString();
        const textParts: string[] = [timeStr];
        const objectArgs: any[] = [];

        args.forEach((arg) => {
            if (typeof arg === "object" && arg !== null) {
                objectArgs.push(arg);
                return;
            }
            textParts.push(String(arg));
        });

        // 构建日志消息
        const logArgs = [`%c${textParts.join(" ")}`, color];
        logArgs.push(...objectArgs);

        // 使用 apply 来传递所有参数
        backLog.apply(null, logArgs);
    }

    private static safeStringify(value: any): string {
        if (typeof value !== "object" || value === null) {
            return String(value);
        }

        const seen = new WeakSet<object>();
        try {
            return JSON.stringify(value, (_key, val) => {
                if (typeof val === "bigint") {
                    return val.toString();
                }

                if (typeof val === "object" && val !== null) {
                    if (seen.has(val)) {
                        return "[Circular]";
                    }
                    seen.add(val);
                }

                return val;
            });
        } catch (error) {
            return String(value);
        }
    }

    private static getDateString(): string {
        let d = new Date();
        let str = d.getHours().toString();
        let timeStr = "";
        timeStr += (str.length == 1 ? "0" + str : str) + ":";
        str = d.getMinutes().toString();
        timeStr += (str.length == 1 ? "0" + str : str) + ":";
        str = d.getSeconds().toString();
        timeStr += (str.length == 1 ? "0" + str : str) + ":";
        str = d.getMilliseconds().toString();
        if (str.length == 1) str = "00" + str;
        if (str.length == 2) str = "0" + str;
        timeStr += str;

        timeStr = "[" + timeStr + "]";
        return timeStr;
    }
}
