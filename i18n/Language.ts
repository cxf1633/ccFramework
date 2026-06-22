import { Singleton } from "../base/Singleton";
import { LanguageData } from "./LanguageData";
import LanguageDefine from "./LanguageDefine";
import { LanguagePack } from "./LanguagePack";

export class LanguageManager extends Singleton {
    private _languages: string[] = this.createLanguageList();
    private readonly _languagePack: LanguagePack = new LanguagePack();
    private readonly _defaultLanguage: string = LanguageDefine.enus;

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

        this.loadJson(nextLanguage).then((loaded) => {
            if (!loaded && nextLanguage !== this._defaultLanguage) {
                console.log(`[${nextLanguage}] language json is missing, set default language [${this._defaultLanguage}] automatically.`);
                this.loadJson(this._defaultLanguage).then(() => this.applyLanguage(this._defaultLanguage, callback));
                return;
            }

            this.applyLanguage(nextLanguage, callback);
        });
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

    private applyLanguage(language: string, callback?: (success: boolean) => void): void {
        const oldLanguage = LanguageData.current;
        LanguageData.current = language;
        this._languagePack.updateLanguage();
        this._languagePack.releaseLanguageAssets(oldLanguage);
        callback?.(true);
    }
}
