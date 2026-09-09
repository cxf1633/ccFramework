import { sys } from "cc";

export class UrlUtils {
    /**
     * 读取 URL 查询参数（?server=xxx&language=zh 这种）。
     *
     * 只有网页端才有 URL 参数，原生包（Android / iOS / 小游戏）直接跳过。
     * 注意：原生 JSB 里 window / window.location 是存在的，但没有 URLSearchParams，
     * 只用 window 判断挡不住，必须显式按平台跳过，否则启动阶段会抛 ReferenceError。
     */
    public static getUrlParam(name: string): string | null {
        if (!sys.isBrowser) {
            return null;
        }

        const search = window.location.search.replace(/^\?/, '');
        if (!search) {
            return null;
        }

        return new URLSearchParams(search).get(name);
    }
}
