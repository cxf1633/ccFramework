import { assetManager, CCString, Component, sp, _decorator } from "cc";
import { EDITOR } from "cc/env";
import { LanguageData } from "./LanguageData";

const { ccclass, property, menu } = _decorator;

@ccclass("LanguageSpine")
@menu("GameFramework/Language/LanguageSpine")
export class LanguageSpine extends Component {
    @property({ serializable: true })
    private _dataID: string = "";

    @property({ type: CCString, serializable: true })
    public get dataID(): string {
        return this._dataID || "";
    }

    public set dataID(value: string) {
        this._dataID = value;
        if (!EDITOR) {
            this.updateSpine();
        }
    }

    private _defaultAnimation: string = "";

    protected onLoad(): void {
        const spine = this.getComponent(sp.Skeleton);
        this._defaultAnimation = spine?.animation || "";
    }

    protected start(): void {
        this.updateSpine();
    }

    public language(): void {
        this.updateSpine();
    }

    private updateSpine(): void {
        const skeletonData = this.getSkeletonData();
        if (!skeletonData) {
            console.error(`[LanguageSpine] Resource not found: spine/${LanguageData.current}/${this.dataID}`);
            return;
        }

        const skeleton = this.getComponent(sp.Skeleton);
        if (!skeleton) {
            return;
        }

        skeleton.skeletonData = skeletonData;
        if (this._defaultAnimation) {
            skeleton.setAnimation(0, this._defaultAnimation, true);
        }
    }

    private getSkeletonData(): sp.SkeletonData | null {
        for (const source of LanguageData.businessSources) {
            const businessBundle = assetManager.getBundle(source.bundleName);
            const businessSkeletonData = businessBundle?.get(`${source.path}/${this.getBundlePath()}`, sp.SkeletonData);
            if (businessSkeletonData) {
                return businessSkeletonData;
            }
        }

        const languageBundle = assetManager.getBundle(LanguageData.bundleName);
        return languageBundle?.get(this.getBundlePath(), sp.SkeletonData) || null;
    }

    private getBundlePath(): string {
        return `spine/${LanguageData.current}/${this.dataID}`;
    }
}
