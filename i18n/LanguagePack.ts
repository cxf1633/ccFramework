import { Asset, AssetManager, assetManager, director, JsonAsset, warn } from "cc";
import { LanguageData } from "./LanguageData";
import { LanguageLabel } from "./LanguageLabel";
import { LanguageSpine } from "./LanguageSpine";
import { LanguageSprite } from "./LanguageSprite";

export class LanguagePack {
    /**
     * 确保指定业务语言 Bundle 已加载。
     * 场景 Prefab 可能仍序列化引用中文资源，切换到其他语言后也需要中文 Bundle
     * 的资源索引参与反序列化。
     */
    public ensureBusinessBundle(lang: string): Promise<AssetManager.Bundle | null> {
        return this.ensureBundle(LanguageData.getBusinessBundleName(lang.toLowerCase()));
    }

    public updateLanguage(): void {
        const scene = director.getScene();
        if (!scene) {
            return;
        }

        scene.children.forEach((rootNode) => {
            rootNode.getComponentsInChildren(LanguageLabel).forEach((label) => label.language());
            rootNode.getComponentsInChildren(LanguageSprite).forEach((sprite) => sprite.language());
            rootNode.getComponentsInChildren(LanguageSpine).forEach((spine) => spine.language());
        });
    }

    public async loadLanguageAssets(lang: string, callback?: (lang: string) => void): Promise<void> {
        await this.loadTexture(lang);
        await this.loadSpine(lang);
        await this.loadJson(lang);
        callback?.(lang);
    }

    public async loadTexture(lang: string): Promise<void> {
        const language = lang.toLowerCase();
        await this.loadBusinessBundleDir(language, "texture");
        await this.loadBundleDir(`texture/${language}`);
    }

    public async loadSpine(lang: string): Promise<void> {
        const language = lang.toLowerCase();
        await this.loadBusinessBundleDir(language, "spine");
        await this.loadBundleDir(`spine/${language}`);
    }

    public async loadJson(lang: string): Promise<boolean> {
        const language = lang.toLowerCase();
        const nextJson: Record<string, string> = {};
        let loaded = false;
        const projectJson = await this.loadBusinessBundleJson(language);
        if (projectJson) {
            Object.assign(nextJson, projectJson);
            loaded = true;
        }

        const frameworkJson = await this.loadBundleJson(`json/${language}`);
        if (frameworkJson) {
            Object.assign(nextJson, frameworkJson);
            loaded = true;
        }

        LanguageData.json = nextJson;
        return loaded;
    }

    public releaseLanguageAssets(lang: string): void {
        if (!lang) {
            return;
        }

        const language = lang.toLowerCase();
        const businessBundle = assetManager.getBundle(LanguageData.getBusinessBundleName(language));
        if (businessBundle) {
            businessBundle.releaseAll();
            assetManager.removeBundle(businessBundle);
        }

        const bundle = assetManager.getBundle(LanguageData.bundleName);
        this.releaseDir(bundle, `texture/${language}`);
        this.releaseDir(bundle, `spine/${language}`);
        this.releaseAsset(bundle?.get(`json/${language}`, JsonAsset) || null);
    }

    private async loadBusinessBundleJson(language: string): Promise<Record<string, string> | null> {
        const bundle = await this.ensureBusinessBundle(language);
        if (!bundle) {
            return null;
        }

        return new Promise((resolve) => {
            bundle.load(language, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }

                resolve(asset.json as Record<string, string>);
            });
        });
    }

    private async loadBusinessBundleDir(language: string, path: string): Promise<void> {
        const bundle = await this.ensureBusinessBundle(language);
        if (!bundle || bundle.getDirWithPath(path).length <= 0) {
            return;
        }

        await new Promise<void>((resolve) => {
            bundle.loadDir(path, (err) => {
                if (err) {
                    warn(`[LanguagePack] bundle dir load failed: ${bundle.name}/${path}`);
                }
                resolve();
            });
        });
    }

    private async loadBundleJson(path: string): Promise<Record<string, string> | null> {
        const bundle = await this.ensureLanguageBundle();
        if (!bundle) {
            return null;
        }

        return new Promise((resolve) => {
            bundle.load(path, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }

                resolve(asset.json as Record<string, string>);
            });
        });
    }

    private async loadBundleDir(path: string): Promise<void> {
        const bundle = await this.ensureLanguageBundle();
        if (!bundle) {
            return;
        }

        const infos = bundle.getDirWithPath(path);
        if (!infos || infos.length <= 0) {
            return;
        }

        return new Promise((resolve) => {
            bundle.loadDir(path, (err) => {
                if (err) {
                    warn(`[LanguagePack] bundle dir load failed: ${LanguageData.bundleName}/${path}`);
                }
                resolve();
            });
        });
    }

    private ensureLanguageBundle(): Promise<AssetManager.Bundle | null> {
        return this.ensureBundle(LanguageData.bundleName);
    }

    private ensureBundle(bundleName: string): Promise<AssetManager.Bundle | null> {
        const existing = assetManager.getBundle(bundleName);
        if (existing) {
            return Promise.resolve(existing);
        }

        return new Promise((resolve) => {
            assetManager.loadBundle(bundleName, { cacheable: true }, (err, bundle) => {
                if (err || !bundle) {
                    warn(`[LanguagePack] language bundle load failed: ${err?.message || bundleName}`);
                    resolve(null);
                    return;
                }

                resolve(bundle);
            });
        });
    }

    private releaseDir(bundle: AssetManager.Bundle | null, path: string): void {
        const infos = bundle?.getDirWithPath(path);
        if (!infos || infos.length <= 0) {
            return;
        }

        infos.forEach((info) => {
            const asset = assetManager.assets.get(info.uuid);
            this.releaseAsset(asset || null);
        });
    }

    private releaseAsset(asset: Asset | null): void {
        if (asset) {
            asset.decRef();
        }
    }
}
