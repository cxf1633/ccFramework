import { Singleton } from "../base/Singleton";
import { LanguageData } from "./LanguageData";
import LanguageDefine from "./LanguageDefine";
import { LanguagePack } from "./LanguagePack";

export class LanguageManager extends Singleton {
    private _languages: string[] = this.createLanguageList();
    private readonly _languagePack: LanguagePack = new LanguagePack();
    private readonly _defaultLanguage: string = LanguageDefine.enus;
    private languageReadyPromise: Promise<void> = Promise.resolve();

    public get languages(): string[] {
        return this._languages;
    }

    public set languages(languages: string[]) {
        this._languages = languages;
    }

    public get current(): string {
        return LanguageData.current;
    }

    public get pack(): LanguagePack {
        return this._languagePack;
    }

    public isExist(lang: string): boolean {
        return this.languages.indexOf(lang) > -1;
    }

    public getNextLang(): string {
        const supportLangs = this.languages;
        const index = supportLangs.indexOf(LanguageData.current);
        return supportLangs[(index + 1) % supportLangs.length];
    }

    public setLanguage(language: string, callback?: (success: boolean) => void): void {
        let nextLanguage = this.normalizeLanguage(language);

        if (!this.isExist(nextLanguage)) {
            console.log(`[${nextLanguage}] is not supported, set default language [${this._defaultLanguage}] automatically.`);
            nextLanguage = this._defaultLanguage;
        }

        if (nextLanguage === LanguageData.current) {
            callback?.(false);
            return;
        }

        this.languageReadyPromise = this.changeLanguage(nextLanguage, callback);
    }

    /** 等待最近一次 setLanguage 的资源加载与应用完成。 */
    public waitUntilReady(): Promise<void> {
        return this.languageReadyPromise;
    }

    private async changeLanguage(nextLanguage: string, callback?: (success: boolean) => void): Promise<void> {
        const loaded = await this.loadLanguageAssets(nextLanguage);
        if (!loaded && nextLanguage !== this._defaultLanguage) {
            console.log(`[${nextLanguage}] language json is missing, set default language [${this._defaultLanguage}] automatically.`);
            await this.loadLanguageAssets(this._defaultLanguage);
            this.applyLanguage(this._defaultLanguage, callback);
            return;
        }

        this.applyLanguage(nextLanguage, callback);
    }

    public getLangByID(labId: string, params?: Array<{ key: string, value: string }>): string {
        return LanguageData.getLangByID(labId, params);
    }

    public async loadTexture(): Promise<void> {
        const lang = LanguageData.current.toLowerCase();
        await this._languagePack.loadTexture(lang);
    }

    public async loadJson(lang: string, callback?: (lang: string) => void): Promise<boolean> {
        const language = this.normalizeLanguage(lang);
        const loaded = await this._languagePack.loadJson(language);
        callback?.(language);
        return loaded;
    }

    public releaseLanguageAssets(lang: string): void {
        const language = lang.toLowerCase();
        this._languagePack.releaseLanguageAssets(language);
    }

    private createLanguageList(): string[] {
        return Object.keys(LanguageDefine).map((key) => (LanguageDefine as any)[key]);
    }

    private normalizeLanguage(language: string): string {
        if (language == null || language === "") {
            return this._defaultLanguage;
        }

        const normalized = language.toLowerCase();
        if (normalized === "zh") {
            return LanguageDefine.zhcn;
        }

        if (normalized === "en") {
            return LanguageDefine.enus;
        }

        return normalized;
    }

    private async loadLanguageAssets(language: string): Promise<boolean> {
        // 语言目录随所属游戏 Bundle 加载，同时具备默认中文资源的索引。
        const loaded = await this.loadJson(language);
        if (!loaded) {
            return false;
        }

        await this._languagePack.loadTexture(language);
        await this._languagePack.loadSpine(language);
        return true;
    }

    private applyLanguage(language: string, callback?: (success: boolean) => void): void {
        const oldLanguage = LanguageData.current;
        LanguageData.current = language;
        this._languagePack.updateLanguage();
        // Prefab 默认序列化引用中文图片；保留中文资源，避免缓存 Prefab 再次激活时引用失效。
        if (oldLanguage !== LanguageDefine.zhcn) {
            this._languagePack.releaseLanguageAssets(oldLanguage);
        }
        callback?.(true);
    }
}
