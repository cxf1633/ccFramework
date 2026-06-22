import { assetManager, CCString, Component, Size, Sprite, SpriteFrame, UITransform, _decorator } from "cc";
import { EDITOR } from "cc/env";
import { LanguageData } from "./LanguageData";

const { ccclass, property, menu, disallowMultiple, requireComponent, executeInEditMode } = _decorator;

@ccclass("LanguageSprite")
@disallowMultiple
@requireComponent(Sprite)
@executeInEditMode
@menu("GameFramework/Language/LanguageSprite")
export class LanguageSprite extends Component {
    @property({ serializable: true })
    private _dataID: string = "";

    @property({ type: CCString, serializable: true, readonly: true })
    public get dataID(): string {
        return this._dataID || "";
    }

    public set dataID(value: string) {
        this._dataID = value;
        if (!EDITOR) {
            this.updateSprite();
        }
    }

    @property
    private isRawSize: boolean = true;

    @property({ visible: false })
    private resUuid: string = "";

    protected onLoad(): void {
        if (EDITOR) {
            this.node.on("spriteframe-changed", this.onChangeSpriteFrame, this);
        }
    }

    protected onDestroy(): void {
        if (EDITOR) {
            this.node.off("spriteframe-changed", this.onChangeSpriteFrame, this);
        }
    }

    protected onEnable(): void {
        if (EDITOR) {
            this.onChangeSpriteFrame();
        }
    }

    protected start(): void {
        if (!EDITOR) {
            this.updateSprite();
        }
    }

    public language(): void {
        this.updateSprite();
    }

    private updateSprite(): void {
        const spriteFrame = this.getSpriteFrame();
        if (!spriteFrame) {
            console.error("[LanguageSprite] Resource not found: " + this.getResourcePath());
            return;
        }

        const sprite = this.getComponent(Sprite);
        if (!sprite) {
            return;
        }

        sprite.spriteFrame = spriteFrame;
        if (this.isRawSize) {
            const rawSize = ((spriteFrame as any).originalSize || (spriteFrame as any)._originalSize) as Size | undefined;
            if (rawSize) {
                sprite.getComponent(UITransform)?.setContentSize(rawSize);
            }
        }
    }

    private getSpriteFrame(): SpriteFrame | null {
        const resourcesBundle = assetManager.getBundle("resources");
        const resourcesSpriteFrame = resourcesBundle?.get(this.getResourcePath(), SpriteFrame);
        if (resourcesSpriteFrame) {
            return resourcesSpriteFrame;
        }

        const languageBundle = assetManager.getBundle(LanguageData.bundleName);
        return languageBundle?.get(this.getBundlePath(), SpriteFrame) || null;
    }

    private getResourcePath(): string {
        return `${LanguageData.path_texture}/${LanguageData.current}/${this.dataID}/spriteFrame`;
    }

    private getBundlePath(): string {
        return `texture/${LanguageData.current}/${this.dataID}/spriteFrame`;
    }

    private onChangeSpriteFrame(): void {
        if (!EDITOR) {
            return;
        }

        const sprite = this.getComponent(Sprite);
        const spriteFrame = sprite?.spriteFrame;
        if (!spriteFrame) {
            return;
        }

        this.dataID = spriteFrame.name;
        this.resUuid = (spriteFrame as any)._uuid || "";
    }
}
