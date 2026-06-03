export class StorageManager {
    private static _instance: StorageManager | null = null;

    public static getInstance(): StorageManager {
        if (!this._instance) {
            this._instance = new StorageManager();
        }

        return this._instance;
    }

    public getItem(key: string): string | null {
        return localStorage.getItem(key);
    }

    public setItem(key: string, value: string): void {
        localStorage.setItem(key, value);
    }

    public removeItem(key: string): void {
        localStorage.removeItem(key);
    }

    public clear(): void {
        localStorage.clear();
    }

    public key(index: number): string | null {
        return localStorage.key(index);
    }

    public get length(): number {
        return localStorage.length;
    }
}
