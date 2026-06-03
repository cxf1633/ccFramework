import { Asset, AssetManager, assetManager, ImageAsset, Prefab, Rect, resources, SpriteFrame, Texture2D } from "cc";

type AssetType<T extends Asset> = new (...args: any[]) => T;

export interface PrefabLoadResult {
    success: boolean;
    prefab?: Prefab;
    error?: string;
}

export class ResManager {
    private readonly prefabCache: Map<string, Prefab> = new Map();
    private readonly loadingPrefabMap: Map<string, Promise<PrefabLoadResult>> = new Map();

    public getBundle(bundleName: string): AssetManager.Bundle | null {
        return assetManager.getBundle(bundleName);
    }

    public loadBundle(bundleName: string, options?: Record<string, any>): Promise<AssetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, options || {}, (err, bundle) => {
                if (err || !bundle) {
                    reject(err || new Error(`Bundle load failed: ${bundleName}`));
                    return;
                }

                resolve(bundle);
            });
        });
    }

    public async ensureBundle(bundleName: string, options?: Record<string, any>): Promise<AssetManager.Bundle> {
        return this.getBundle(bundleName) || await this.loadBundle(bundleName, options);
    }

    public releaseBundle(bundleName: string, releaseAssets: boolean = true): boolean {
        const bundle = this.getBundle(bundleName);
        if (!bundle) {
            return false;
        }

        if (releaseAssets) {
            bundle.releaseAll();
        }

        assetManager.removeBundle(bundle);
        return true;
    }

    public loadFromBundle<T extends Asset>(bundleName: string, path: string, type?: AssetType<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const bundle = this.getBundle(bundleName);
            if (!bundle) {
                reject(new Error(`Bundle not loaded: ${bundleName}`));
                return;
            }

            const onComplete = (err: Error | null, asset: T) => {
                if (err || !asset) {
                    reject(err || new Error(`Asset load failed: ${bundleName}/${path}`));
                    return;
                }

                resolve(asset);
            };

            if (type) {
                bundle.load(path, type, onComplete);
            } else {
                bundle.load(path, onComplete);
            }
        });
    }

    public loadResources<T extends Asset>(path: string, type?: AssetType<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const onComplete = (err: Error | null, asset: T) => {
                if (err || !asset) {
                    reject(err || new Error(`Resource load failed: ${path}`));
                    return;
                }

                resolve(asset);
            };

            if (type) {
                resources.load(path, type, onComplete);
            } else {
                resources.load(path, onComplete);
            }
        });
    }

    public loadRemote<T extends Asset>(url: string, options?: Record<string, any>): Promise<T> {
        return new Promise((resolve, reject) => {
            assetManager.loadRemote<T>(url, options || {}, (err, asset) => {
                if (err || !asset) {
                    reject(err || new Error(`Remote asset load failed: ${url}`));
                    return;
                }

                resolve(asset);
            });
        });
    }

    public loadResourcesImageAsync(url: string): Promise<SpriteFrame> {
        return new Promise((resolve, reject) => {
            resources.load(url, ImageAsset, (err, imageAsset) => {
                if (err || !imageAsset) {
                    console.log("url", url);
                    console.error("resources image load failed:", err);
                    reject(err || new Error(`Resources image load failed: ${url}`));
                    return;
                }

                resolve(this.createSpriteFrame(imageAsset));
            });
        });
    }

    public loadRemoteImageAsync(url: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            try {
                assetManager.loadRemote<ImageAsset>(url, { ext: ".png" }, (err, imageAsset) => {
                    if (err || !imageAsset) {
                        console.warn("remote image load failed:", err, url);
                        resolve(null);
                        return;
                    }

                    const spriteFrame = this.createSpriteFrame(imageAsset);
                    const texture = spriteFrame.texture as Texture2D;
                    spriteFrame.rect = new Rect(0, 0, texture.width, texture.height);
                    resolve(spriteFrame);
                });
            } catch (err) {
                console.warn("remote image load failed:", err, url);
                resolve(null);
            }
        });
    }

    public loadCardSpriteFramePromise(path: string): Promise<SpriteFrame> {
        return this.loadFromBundle<SpriteFrame>("resources", `card/${path}/spriteFrame`, SpriteFrame);
    }

    public async loadPrefabFromBundle(bundleName: string, prefabPath: string): Promise<PrefabLoadResult> {
        const keyName = this.getPrefabCacheKey(bundleName, prefabPath);
        const cachedPrefab = this.prefabCache.get(keyName);
        if (cachedPrefab) {
            return {
                success: true,
                prefab: cachedPrefab,
            };
        }

        const loadingPromise = this.loadingPrefabMap.get(keyName);
        if (loadingPromise) {
            return await loadingPromise;
        }

        const loadTask = this.loadPrefabFromBundleInternal(bundleName, prefabPath, keyName);
        this.loadingPrefabMap.set(keyName, loadTask);

        const result = await loadTask;
        this.loadingPrefabMap.delete(keyName);
        return result;
    }

    public clearPrefabCache(prefabPath: string, bundleName?: string): void {
        if (bundleName) {
            this.prefabCache.delete(this.getPrefabCacheKey(bundleName, prefabPath));
            return;
        }

        for (const key of [...this.prefabCache.keys()]) {
            if (key.endsWith(prefabPath)) {
                this.prefabCache.delete(key);
            }
        }
    }

    public clearAllPrefabCache(): void {
        this.prefabCache.clear();
        this.loadingPrefabMap.clear();
    }

    private loadPrefabFromBundleInternal(bundleName: string, prefabPath: string, keyName: string): Promise<PrefabLoadResult> {
        return new Promise((resolve) => {
            const bundle = this.getBundle(bundleName);
            if (!bundle) {
                resolve({
                    success: false,
                    error: `Bundle not loaded: ${bundleName}`,
                });
                return;
            }

            bundle.load<Prefab>(prefabPath, (err, prefab) => {
                if (err || !prefab) {
                    resolve({
                        success: false,
                        error: `Prefab load failed: ${keyName}, error: ${err?.message || "unknown"}`,
                    });
                    return;
                }

                this.prefabCache.set(keyName, prefab);
                resolve({
                    success: true,
                    prefab,
                });
            });
        });
    }

    private createSpriteFrame(imageAsset: ImageAsset): SpriteFrame {
        const texture = new Texture2D();
        texture.image = imageAsset;

        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        return spriteFrame;
    }

    private getPrefabCacheKey(bundleName: string, prefabPath: string): string {
        return `${bundleName}/${prefabPath}`;
    }
}
