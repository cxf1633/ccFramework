export class UrlUtils {
    public static getUrlParam(name: string): string | null {
        if (typeof window === 'undefined' || !window.location) {
            return null;
        }

        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
}
