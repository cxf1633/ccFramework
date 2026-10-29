import { TTFFont } from "cc";

export interface LanguageSource {
    bundleName: string;
    /** 相对于所属 Bundle 的语言目录。 */
    path: string;
}

export class LanguageData {
    public static readonly bundleName: string = "language";
    /** 应用配置的语言目录，包含 json、texture 和可选的 spine。 */
    public static businessSources: readonly LanguageSource[] = [];

    public static current: string = "";
    public static json: Record<string, string> = {};
    public static excel: any = null;
    public static font: TTFFont | null = null;

    public static getLangByID(labId: string, params: Array<{ key: string, value: string }> = []): string {
        let text = this.json[labId];
        if (text && params.length > 0) {
            params.forEach((param) => {
                text = text.replace(`%{${param.key}}`, param.value);
            });
        }

        if (text) {
            return text;
        }

        if (this.excel) {
            const record = this.excel[labId];
            if (record) {
                return record[this.current];
            }
        }

        return labId;
    }
}
