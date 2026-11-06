import { _decorator, CCInteger, Color, Component, isValid, Size, Sprite, SpriteFrame, UITransform } from 'cc';

const { ccclass, property, disallowMultiple, menu } = _decorator;

interface PreviewState {
    source: Component;
    frame: SpriteFrame | null;
    color: Color;
    enabled: boolean;
    active: boolean;
    size: Size;
}

/** 目标位置的悬停预览；图片选择、接收规则及放下后的业务由调用方负责。 */
@ccclass('UIDropPreview')
@disallowMultiple
@menu('UI/UIDropPreview')
export class UIDropPreview extends Component {
    @property({ type: Sprite, tooltip: '复用此 Sprite 显示预览，清理时恢复原图片、颜色、显隐和尺寸' })
    public previewSprite: Sprite = null!;

    @property({ type: CCInteger, min: 0, max: 255, tooltip: '预览透明度，128 约为 50%' })
    public previewAlpha = 128;

    private preview: PreviewState | null = null;

    protected onLoad(): void {
        if (!this.previewSprite) throw new Error('[UIDropPreview] 请在预制体配置 Preview Sprite');
    }

    /** 同一来源的连续 OVER 只刷新预览，不覆盖首次保存的原始状态。 */
    public show(source: Component, frame: SpriteFrame): boolean {
        const sprite = this.previewSprite;
        if (!this.enabledInHierarchy || !isValid(sprite, true) || !isValid(source, true) || !isValid(frame, true)) return false;
        if (this.preview && this.preview.source !== source) {
            if (isValid(this.preview.source, true) && this.preview.source.enabledInHierarchy) return false;
            this.clear();
        }
        if (!this.preview) {
            this.preview = {
                source,
                frame: sprite.spriteFrame,
                color: sprite.color.clone(),
                enabled: sprite.enabled,
                active: sprite.node.active,
                size: sprite.getComponent(UITransform)!.contentSize.clone(),
            };
        }
        sprite.node.active = true;
        sprite.enabled = true;
        sprite.spriteFrame = frame;
        const color = this.preview.color.clone();
        color.a = this.previewAlpha;
        sprite.color = color;
        return true;
    }

    /** 放下时先清理预览，再写入正式内容；不匹配的来源不会清掉其他来源的预览。 */
    public clear(source?: Component): boolean {
        const preview = this.preview;
        if (!preview || (source && preview.source !== source)) return false;
        this.preview = null;
        const sprite = this.previewSprite;
        if (isValid(sprite, true)) {
            sprite.spriteFrame = preview.frame;
            sprite.color = preview.color;
            sprite.enabled = preview.enabled;
            const transform = sprite.getComponent(UITransform);
            if (transform && isValid(transform, true)) transform.setContentSize(preview.size);
            // 同节点时 show 不会改变宿主显隐；避免清理过程重新激活已被隐藏的宿主。
            if (sprite.node !== this.node) sprite.node.active = preview.active;
        }
        return true;
    }

    protected onDisable(): void {
        this.clear();
    }

    protected onDestroy(): void {
        this.clear();
    }
}
