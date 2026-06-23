import { CCString, Component, Enum, Label, RichText, TTFFont, _decorator, warn } from "cc";
import { EDITOR } from "cc/env";
import { LanguageData } from "./LanguageData";

const { ccclass, property, menu } = _decorator;

@ccclass("LangLabelParamsItem")
export class LangLabelParamsItem {
    @property
    key: string = "";

    @property
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
        displayName: "params",
    })
    private _params: Array<LangLabelParamsItem> = [];

    @property({
        type: LangLabelParamsItem,
        displayName: "params",
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

    @property({ type: CCString, serializable: true })
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

        if (label) {
            if (font) {
                label.font = font;
            }
            label.string = this.string;
            this.initFontSize = label.fontSize;
            label.updateRenderData(true);
            return;
        }

        if (richText) {
            if (font) {
                richText.font = font;
            }
            richText.string = this.string;
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
