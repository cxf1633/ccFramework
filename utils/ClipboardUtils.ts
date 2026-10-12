import { native, sys } from 'cc';
import { Logger } from 'db://assets/framework/log/Logger';

declare const wx: any;

/**
 * 剪贴板工具：把文本复制到系统剪贴板。
 *
 * 三条路按平台走：
 * 1. 原生（Android / iOS / HarmonyOS / 桌面）：用引擎自带的桥 `native.copyTextToClipboard`
 *    （`cc` 里导出，引擎原生层已实现：Android 走 `com.cocos.lib.CocosHelper`，iOS/macOS 走
 *    UIPasteboard / NSPasteboard，Windows/Linux 走 SDL —— 项目侧不需要写任何原生代码）；
 * 2. 微信小游戏：`wx.setClipboardData`；
 * 3. 浏览器 / 编辑器预览：优先 `navigator.clipboard.writeText`（需要 https 或 localhost），
 *    失败（http 页面、旧浏览器、没有用户手势）时退回临时 `textarea` + `execCommand('copy')`。
 *
 * 常用写法：
 * ```ts
 * const copied = await ClipboardUtils.copyText('123456');
 * if (copied) { app.notice.toast(app.language.getLangByID('已复制房间号')); }
 * ```
 */
export class ClipboardUtils {
    /**
     * 复制文本到系统剪贴板。
     *
     * @param text 要复制的文本，空串直接返回 false
     * @returns 是否复制成功（浏览器那条路是异步的，所以整体是 Promise）
     */
    public static async copyText(text: string): Promise<boolean> {
        if (typeof text !== 'string' || text.length <= 0) {
            Logger.warn('[ClipboardUtils] copyText 收到空文本，已忽略');
            return false;
        }

        if (this.copyOnNative(text)) {
            return true;
        }

        if (this.copyOnMiniGame(text)) {
            return true;
        }

        return await this.copyOnBrowser(text);
    }

    /** 原生：引擎自带的剪贴板桥（Android / iOS 都有实现，不需要自己写反射） */
    private static copyOnNative(text: string): boolean {
        if (!sys.isNative) {
            return false;
        }

        // 老包 / 引擎版本对不上时这里可能是 undefined（引擎侧也是 globalJsb.copyTextToClipboard?.bind(...)
        // 的写法）。跟"调了但抛错"分开报，线上排查一眼能分清是桥没注册还是调用失败。
        if (typeof native?.copyTextToClipboard !== 'function') {
            Logger.error(`[ClipboardUtils] 原生剪贴板桥不可用（native.copyTextToClipboard 未注册），${this.describeRunEnv()}`);
            return false;
        }

        try {
            native.copyTextToClipboard(text);
            return true;
        } catch (error) {
            Logger.error(`[ClipboardUtils] 原生剪贴板复制失败，${this.describeRunEnv()}`, error);
            return false;
        }
    }

    /** 微信小游戏：wx.setClipboardData（微信自己会弹一次"内容已复制"，这里不再重复提示） */
    private static copyOnMiniGame(text: string): boolean {
        if (sys.platform !== sys.Platform.WECHAT_GAME) {
            return false;
        }

        if (typeof wx === 'undefined' || typeof wx.setClipboardData !== 'function') {
            Logger.warn(`[ClipboardUtils] 小游戏环境里没有 wx.setClipboardData，${this.describeRunEnv()}`);
            return false;
        }

        try {
            wx.setClipboardData({ data: text });
            return true;
        } catch (error) {
            Logger.warn(`[ClipboardUtils] 小游戏剪贴板复制失败，${this.describeRunEnv()}`, error);
            return false;
        }
    }

    /** 浏览器 / 编辑器预览：Clipboard API 优先，失败退回 execCommand */
    private static async copyOnBrowser(text: string): Promise<boolean> {
        const clipboard = typeof navigator !== 'undefined' ? (navigator as any).clipboard : null;
        if (clipboard && typeof clipboard.writeText === 'function') {
            try {
                await clipboard.writeText(text);
                return true;
            } catch (error) {
                // http 页面（非安全上下文）/ 没有用户手势时会走到这里，继续用下面的兜底
                Logger.warn(`[ClipboardUtils] navigator.clipboard 复制失败，改用 execCommand 兜底，${this.describeRunEnv()}`, error);
            }
        }

        return this.copyByExecCommand(text);
    }

    /** 老浏览器兜底：临时插一个 textarea 选中后 execCommand('copy') */
    private static copyByExecCommand(text: string): boolean {
        if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
            Logger.warn(`[ClipboardUtils] 当前环境没有可用的剪贴板接口，${this.describeRunEnv()}`);
            return false;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        // 放到视口外并禁止滚动，避免复制瞬间页面跳动
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';
        textarea.style.opacity = '0';
        textarea.setAttribute('readonly', 'readonly');
        document.body.appendChild(textarea);
        try {
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            return document.execCommand('copy');
        } catch (error) {
            Logger.warn(`[ClipboardUtils] execCommand 复制失败，${this.describeRunEnv()}`, error);
            return false;
        } finally {
            document.body.removeChild(textarea);
        }
    }

    /**
     * 失败日志用的运行环境描述。
     *
     * `sys.platform / sys.os / sys.browserType` 是引擎的字符串枚举，值本身就是可读文本
     * （例如 platform=DESKTOP_BROWSER / MOBILE_BROWSER / WECHAT_GAME，os=Windows / Android / iOS）。
     *
     * 原生那条路排查时看 `isNative / os / platform`：`isNative=true` 却没有桥，说明跑的是老引擎打出来的包
     * （原生桥是编译进包的，热更换不掉）；小游戏那条路看 `platform` 是不是 WECHAT_GAME；
     * 浏览器那条路看 `isBrowser / browser` 和有没有 https（非安全上下文拿不到 navigator.clipboard）。
     */
    private static describeRunEnv(): string {
        return `isNative=${sys.isNative} isBrowser=${sys.isBrowser} platform=${sys.platform} `
            + `os=${sys.os}(${sys.osVersion}) browser=${sys.browserType}(${sys.browserVersion})`;
    }
}
