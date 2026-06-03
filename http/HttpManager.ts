export class HttpManager {
    private static _instance: HttpManager = null;

    private constructor() {
    }

    public static get instance(): HttpManager {
        if (!this._instance) {
            this._instance = new HttpManager();
        }
        return this._instance;
    }

    private setHeaders(xhr: XMLHttpRequest): void {
        xhr.setRequestHeader("Content-Type", "application/json");
    }

    public get(url: string, params: any, callback: (data: any) => void, timeout: number = 5000): void {
        const xhr = new XMLHttpRequest();
        const queryString = this.buildQueryString(params);
        const fullUrl = queryString ? `${url}?${queryString}` : url;

        xhr.open("GET", fullUrl, true);
        xhr.timeout = timeout;
        this.setHeaders(xhr);

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    callback(response);
                } catch (e) {
                    console.error("Parse response failed:", e);
                    callback(null);
                }
            } else {
                console.error("HTTP request failed, status:", xhr.status);
                callback(null);
            }
        };

        xhr.ontimeout = () => {
            console.error("HTTP request timeout");
            callback(null);
        };

        xhr.onerror = () => {
            console.error("HTTP request failed");
            callback(null);
        };

        xhr.send();
    }

    public post(url: string, params: any, callback: (data: any) => void, timeout: number = 5000): void {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.timeout = timeout;
        this.setHeaders(xhr);

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    callback(response);
                } catch (e) {
                    console.error("Parse response failed:", e);
                    callback(null);
                }
            } else {
                console.error("HTTP request failed, status:", xhr.status);
                callback(null);
            }
        };

        xhr.ontimeout = () => {
            console.error("HTTP request timeout");
            callback(null);
        };

        xhr.onerror = () => {
            console.error("HTTP request failed");
            callback(null);
        };

        xhr.send(JSON.stringify(params));
    }

    private buildQueryString(params: any): string {
        if (!params) return "";
        return Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join("&");
    }

    public async syncGet(url: string, params: any): Promise<any> {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        this.setHeaders(xhr);
        xhr.send(JSON.stringify(params));
        return JSON.parse(xhr.responseText);
    }

    public async syncPost(url: string, params: any): Promise<any> {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, false);
        this.setHeaders(xhr);
        xhr.send(JSON.stringify(params));
        return JSON.parse(xhr.responseText);
    }
}
