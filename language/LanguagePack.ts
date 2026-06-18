import { Asset, AssetManager, assetManager, director, JsonAsset, resources, TTFFont, warn } from "cc";
import { LanguageData } from "./LanguageData";
import { LanguageLabel } from "./LanguageLabel";
import { LanguageSpine } from "./LanguageSpine";
import { LanguageSprite } from "./LanguageSprite";

export class LanguagePack {
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
        await this.loadResourcesDir(`${LanguageData.path_texture}/${language}`);
        await this.loadBundleDir(`texture/${language}`);
    }

    public async loadSpine(lang: string): Promise<void> {
        const language = lang.toLowerCase();
        await this.loadResourcesDir(`${LanguageData.path_spine}/${language}`);
        await this.loadBundleDir(`spine/${language}`);
    }

    public async loadJson(lang: string): Promise<boolean> {
        const language = lang.toLowerCase();
        const nextJson: Record<string, string> = {};
        let loaded = false;
        const projectJson = await this.loadResourcesJson(`${LanguageData.path_json}/${language}`);
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
        this.releaseDir(resources, `${LanguageData.path_texture}/${language}`);
        this.releaseDir(resources, `${LanguageData.path_spine}/${language}`);
        this.releaseAsset(resources.get(`${LanguageData.path_json}/${language}`, JsonAsset));
        this.releaseAsset(resources.get(`${LanguageData.path_json}/${language}`, TTFFont));

        const bundle = assetManager.getBundle(LanguageData.bundleName);
        this.releaseDir(bundle, `texture/${language}`);
        this.releaseDir(bundle, `spine/${language}`);
        this.releaseAsset(bundle?.get(`json/${language}`, JsonAsset) || null);
    }

    private loadResourcesJson(path: string): Promise<Record<string, string> | null> {
        return new Promise((resolve) => {
            resources.load(path, JsonAsset, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                    return;
                }

                resolve(asset.json as Record<string, string>);
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

    private loadResourcesDir(path: string): Promise<void> {
        const infos = resources.getDirWithPath(path);
        if (!infos || infos.length <= 0) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            resources.loadDir(path, (err) => {
                if (err) {
                    warn(`[LanguagePack] resources dir load failed: ${path}`);
                }
                resolve();
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
        const existing = assetManager.getBundle(LanguageData.bundleName);
        if (existing) {
            return Promise.resolve(existing);
        }

        return new Promise((resolve) => {
            assetManager.loadBundle(LanguageData.bundleName, { cacheable: true }, (err, bundle) => {
                if (err || !bundle) {
                    warn(`[LanguagePack] language bundle load failed: ${err?.message || LanguageData.bundleName}`);
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
