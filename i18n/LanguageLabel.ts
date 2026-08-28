import { CCString, Component, Enum, Label, RichText, TTFFont, _decorator, warn } from "cc";
import { EDITOR } from "cc/env";
import { LanguageData } from "./LanguageData";

const { ccclass, property, menu } = _decorator;

@ccclass("LangLabelParamsItem")
export class LangLabelParamsItem {
    @property({
        displayName: "参数名",
        tooltip: "多语言文本中的占位参数名。例如文本包含 %{name} 时，此处填写 name。",
    })
    key: string = "";

    @property({
        displayName: "替换值",
        tooltip: "运行时用于替换对应占位参数的文本内容。",
    })
    value: string = "";
}

export enum LanguageLabelFirstLetterCase {
    Original = 0,
    Upper = 1,
    Lower = 2,
}

Enum(LanguageLabelFirstLetterCase);

@ccclass("LanguageLabel")
@menu("GameFramework/Language/LanguageLabel")
export class LanguageLabel extends Component {
    @property({
        type: LangLabelParamsItem,
        displayName: "替换参数",
        tooltip: "多语言文本的占位参数列表，用于替换 %{参数名} 格式的内容。",
    })
    private _params: Array<LangLabelParamsItem> = [];

    @property({
        type: LangLabelParamsItem,
        displayName: "替换参数",
        tooltip: "多语言文本的占位参数列表，用于替换 %{参数名} 格式的内容。",
    })
    public set params(value: Array<LangLabelParamsItem>) {
        this._params = value;
        if (!EDITOR) {
            this._needUpdate = true;
        }
    }

    public get params(): Array<LangLabelParamsItem> {
        return this._params || [];
    }

    @property({ serializable: true })
    private _dataID: string = "";

    @property({
        type: CCString,
        serializable: true,
        displayName: "文本资源标识",
        tooltip: "多语言 JSON 中对应文本的键名。例如填写 Main_Start，会读取当前语言配置中的 Main_Start。",
    })
    public get dataID(): string {
        return this._dataID || "";
    }

    public set dataID(value: string) {
        this._dataID = value;
        if (!EDITOR) {
            this._needUpdate = true;
        }
    }

    @property({
        type: LanguageLabelFirstLetterCase,
        displayName: "首字母处理",
        tooltip: "Original 保持原样，Upper 将首字母转为大写，Lower 将首字母转为小写。",
    })
    public firstLetterCase: LanguageLabelFirstLetterCase = LanguageLabelFirstLetterCase.Original;

    private _needUpdate: boolean = false;
    public initFontSize: number = 0;

    public get string(): string {
        let value = LanguageData.getLangByID(this._dataID, this._params);
        if (!value) {
            warn("[LanguageLabel] no language found, using dataID to replace");
            value = this._dataID;
        }
        return this.applyFirstLetterCase(value);
    }

    public language(): void {
        this._needUpdate = true;
    }

    protected onLoad(): void {
        this.updateContent();
    }

    public setVars(key: string, value: string): void {
        let hasKey = false;
        this._params.forEach((item) => {
            if (item.key === key) {
                item.value = value;
                hasKey = true;
            }
        });

        if (!hasKey) {
            const item = new LangLabelParamsItem();
            item.key = key;
            item.value = value;
            this._params.push(item);
        }

        this._needUpdate = true;
    }

    protected update(): void {
        if (!this._needUpdate) {
            return;
        }

        this.updateContent();
        this._needUpdate = false;
    }

    public updateContent(): void {
        const label = this.getComponent(Label);
        const richText = this.getComponent(RichText);
        const font: TTFFont | null = LanguageData.font;
        const localizedString = this._dataID ? this.string : null;

        if (label) {
            if (font) {
                label.font = font;
            }
            if (localizedString !== null) {
                label.string = localizedString;
            }
            this.initFontSize = label.fontSize;
            label.updateRenderData(true);
            return;
        }

        if (richText) {
            if (font) {
                richText.font = font;
            }
            if (localizedString !== null) {
                richText.string = localizedString;
            }
            this.initFontSize = richText.fontSize;
            return;
        }

        warn("[LanguageLabel] cc.Label or cc.RichText component not found");
    }

    private applyFirstLetterCase(value: string): string {
        if (!value) {
            return value;
        }

        switch (this.firstLetterCase) {
            case LanguageLabelFirstLetterCase.Upper:
                return value.charAt(0).toUpperCase() + value.slice(1);
            case LanguageLabelFirstLetterCase.Lower:
                return value.charAt(0).toLowerCase() + value.slice(1);
            case LanguageLabelFirstLetterCase.Original:
            default:
                return value;
        }
    }
}
