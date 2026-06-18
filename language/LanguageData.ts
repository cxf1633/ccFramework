import { TTFFont } from "cc";

export class LanguageData {
    public static readonly bundleName: string = "language";
    public static readonly path_json: string = "language/json";
    public static readonly path_texture: string = "language/texture";
    public static readonly path_spine: string = "language/spine";

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
