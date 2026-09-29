import {
    _decorator,
    assetManager,
    Color,
    Component,
    Font,
    Graphics,
    ImageAsset,
    Label,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    sys,
    Texture2D,
    UITransform,
    Vec3,
} from 'cc';
import { ZlibUtils } from '../../utils/ZlibUtils';

const { ccclass, property, requireComponent } = _decorator;

/** 内容区域矩形（父节点本地坐标，已按父节点锚点换算）。 */
interface CaptchaRect {
    left: number;
    right: number;
    bottom: number;
    top: number;
}

/**
 * 客户端图形验证码组件（纯本地生成，弱防刷，适合流程演示/过渡）。
 *
 * 本组件为框架通用组件，不依赖任何业务配置/模型：
 * 需要的规则（字符集、位数、颜色、尺寸等）全部通过属性/方法参数传入，
 * 具体规则来源（如账号配置表 accountConfig）由使用方模块自行决定并赋值。
 *
 * 布局说明：字符排布以父节点 UITransform 的实际锚点换算内容区域（例如锚点 (1, 0.5) 会从锚点向左排布，
 * 不假设锚点是 (0.5, 0.5) 的中心）；运行时创建的字符与干扰子节点会自动继承父节点 layer（UI_2D）。
 *
 * 渲染方式：
 *  - 优先使用 digitFrames 字模（数组下标 = charSet 中字符的顺序），例如 charSet='0123456789' 时下标 0~9 对应数字 0~9；
 *  - 字模不足（长度 < charSet.length）时，自动降级为系统字体 Label 渲染字符，方便资源未到位前联调。
 *
 * 用法（挂到任意带 UITransform 的节点后）：
 *  ```ts
 *  const captcha = node.getComponent(CaptchaView);
 *  captcha.codeLength = 4;                 // 位数（也可在编辑器属性里配）
 *  captcha.refresh();                      // 换一张（onLoad 自动出一张）
 *  const code = captcha.getCodeText();     // 当前答案
 *  if (!captcha.check(inputText)) {        // 校验输入
 *      captcha.refresh();                  // 错误自动换一张
 *  }
 *  ```
 *
 * 服务端下发验证码接入（本地仍负责渲染图形）：
 *  ```ts
 *  captcha.refreshOnLoad = false;            // onLoad 不本地随机生成
 *  captcha.setOnRequestNewCode(() => {       // 点击“换一张”
 *      fetchCaptchaFromServer().then((code) => captcha.setCode(code)); // 服务端答案 -> 本地渲染
 *  });
 *  ```
 *
 * 服务端下发图片接入（服务端直接给图片，例如 100/1004 的 imageBase64）：
 *  ```ts
 *  captcha.refreshOnLoad = false;            // onLoad 不本地随机生成
 *  fetchCaptchaFromServer().then((res) => {
 *      return captcha.setServerImage(res.imageBase64);   // 服务端图片 -> 挂子节点显示
 *  });
 *  ```
 *  该模式会清掉本地生成的字符/干扰层，两者互斥；`refresh()` 会切回本地随机图形。
 *  图片走 PNG（见 REMOTE_IMAGE_EXT 注释），Web / 小游戏用 DOM 图片通道，
 *  原生端直接把 PNG 字节交给引擎解码，两条路径都不依赖 SVG。
 */
@ccclass('CaptchaView')
@requireComponent(UITransform)
export class CaptchaView extends Component {
    /** 字符字模 SpriteFrame，数组下标 = 该字符在 charSet 中的位置（默认数字 0~9）。少于 charSet.length 张时自动降级为 Label 渲染。 */
    @property({ type: [SpriteFrame], tooltip: '字符字模，下标=该字符在 charSet 中的位置；不足时自动用 Label 渲染' })
    public digitFrames: SpriteFrame[] = [];

    /** 验证码字符集，默认纯数字 "0123456789"；字模顺序按此字符集排列。 */
    @property({ tooltip: '验证码字符集；字模数组下标按此字符顺序对应' })
    public charSet: string = '0123456789';

    /** 验证码位数；0 或非法时兜底 4，且不超过字符集长度。 */
    @property({ tooltip: '验证码位数；0 或非法时兜底 4，且不超过字符集长度' })
    public codeLength: number = 0;

    /** 点击验证码区域是否自动换一张。 */
    @property({ tooltip: '点击验证码区域是否自动换一张' })
    public clickToRefresh: boolean = true;

    /** onLoad 时是否自动随机生成一张；本地模式保持 true；接服务端下发验证码时置 false，等待 setCode() 传入服务端答案。 */
    @property({ tooltip: 'onLoad 时是否自动生成一张；本地模式 true，接服务端下发验证码时 false（等 setCode()）' })
    public refreshOnLoad: boolean = false;

    /** 字符颜色候选（Sprite 染色 / Label 颜色）；留空用内置浅色系，适配深色背景。 */
    @property({ type: [Color], tooltip: '字符颜色候选；留空使用内置默认色' })
    public textColors: Color[] = [];

    /** Label 渲染模式（未配字模时）默认使用的字体（TTF 动态字体或 FNT 位图字体）；未设置时回退 CaptchaView 全局默认字体，再回退系统字体。 */
    @property({ type: Font, tooltip: 'Label 模式默认字体（TTF/FNT）；未设置时回退 CaptchaView 全局默认字体（setDefaultLabelFont），再回退系统字体' })
    public defaultLabelFont: Font | null = null;

    /** 干扰线/点的候选色；留空使用内置灰蓝色系。 */
    @property({ type: [Color], tooltip: '干扰线颜色候选；留空使用内置默认色' })
    public noiseColors: Color[] = [];

    /** 内容区域缺省尺寸（节点 UITransform 未配置大小时使用），宽 x 高。 */
    @property({ tooltip: '内容区域兜底尺寸（节点未设置大小时使用）' })
    public fallbackSize = { width: 220, height: 80 };

    private currentCode = '';
    private effectiveLength = 4;
    private effectiveCharSet = '0123456789';

    /** 服务端图片模式下挂载的图片子节点；本地随机模式下为 null。 */
    private serverImageNode: Node | null = null;

    /** 服务端模式下的“换一张”回调：由业务层请求新验证码，取回后调用 setCode() 回填。 */
    private onRequestNewCode: (() => void) | null = null;

    /** 全局默认字体（TTF/FNT）：实例属性 defaultLabelFont 未设置时使用。 */
    private static defaultLabelFont: Font | null = null;

    /** 每个字符上下的随机旋转幅度（度）。 */
    private static readonly MAX_ROTATION = 18;
    /** 每个字符纵向随机偏移（按高度比例）。 */
    private static readonly MAX_Y_JITTER = 0.16;
    /** 每个字符横向随机抖动（按槽宽比例）。 */
    private static readonly MAX_X_JITTER = 0.28;

    /** 服务端图片节点的固定名字（挂在验证码节点下，便于排查）。 */
    private static readonly SERVER_IMAGE_NODE_NAME = 'serverImage';
    /**
     * 远程图片通道用的扩展名。
     *
     * 服务端 100/1004 的 imageBase64 已改为 PNG，所以统一按 `.png` 走：
     * - Web / 小游戏：引擎用 `img.src = "data:image/png;base64,..."` 解码，这条通道必须给 `.png`；
     * - 原生端：没有 DOM Image，改由 createImageAssetFromBytes() 直接喂编码字节（见 loadImageAsset）。
     */
    private static readonly REMOTE_IMAGE_EXT = '.png';

    protected onLoad(): void {
        if (this.clickToRefresh) {
            this.node.on(Node.EventType.TOUCH_END, this.onTouchRefresh, this);
        }

        // 本地随机生成：默认 onLoad 出一张；
        // 接服务端下发验证码时置 refreshOnLoad=false，等待外部 setCode() 后再渲染。
        if (this.refreshOnLoad) {
            this.refresh();
        }
    }

    protected onDestroy(): void {
        if (this.clickToRefresh) {
            this.node.off(Node.EventType.TOUCH_END, this.onTouchRefresh, this);
        }
    }

    // ---------------------------------------------------------------------
    // 对外接口
    // ---------------------------------------------------------------------

    /** 重新生成一组字符并渲染（换一张）。 */
    public refresh(): void {
        this.effectiveCharSet = this.normalizeCharSet(this.charSet);
        this.effectiveLength = this.resolveCodeLength();
        this.currentCode = this.generateCode(this.effectiveLength, this.effectiveCharSet);
        this.rebuildView();
    }

    /** 当前验证码答案（字符集内的字符串）。 */
    public getCodeText(): string {
        return this.currentCode;
    }

    /** 校验用户输入是否正确。 */
    public check(input: string): boolean {
        return input.trim() === this.currentCode;
    }

    /** 动态调整验证码位数并刷新。 */
    public setCodeLength(length: number): void {
        this.codeLength = Math.floor(length) || 0;
        this.refresh();
    }

    /** 动态设置字符集并刷新（字模顺序按新字符集重新对应）。 */
    public setCharSet(charSet: string): void {
        this.charSet = charSet || '0123456789';
        this.refresh();
    }

    /** 当前实际生效的位数。 */
    public getDigitCount(): number {
        return this.effectiveLength;
    }

    /**
     * 服务端下发验证码接入：用服务端返回的答案替换本地随机，并在本地渲染成图形。
     * 调用前通常应把 refreshOnLoad 置 false；code 的每个字符必须在 charSet 内，且长度不超过 charSet.length。
     * @returns 是否成功采用；字符不合法/超长时返回 false 并保持原样。
     */
    public setCode(code: string): boolean {
        const normalized = (code || '').trim();
        const charSet = this.normalizeCharSet(this.charSet);

        if (!normalized || normalized.length > charSet.length) {
            console.warn(`[CaptchaView] 服务端验证码长度非法或为空: "${normalized}"`);
            return false;
        }

        for (let i = 0; i < normalized.length; i++) {
            if (charSet.indexOf(normalized.charAt(i)) < 0) {
                console.warn(`[CaptchaView] 服务端验证码含字符集外字符: "${normalized}", charSet="${charSet}"`);
                return false;
            }
        }

        this.effectiveCharSet = charSet;
        this.effectiveLength = normalized.length;
        this.currentCode = normalized;
        this.rebuildView();
        return true;
    }

    /**
     * 服务端模式下注册“点击换一张”的处理器：
     * 业务层在此请求服务端新验证码，取回后调用 setCode() 回填。
     * 未注册处理器时，点击仍走本地随机 refresh()（便于开发期兜底）。
     */
    public setOnRequestNewCode(handler: (() => void) | null): void {
        this.onRequestNewCode = handler;
    }

    /** 主动“换一张”：已注册服务端处理器则请求服务端，否则本地随机生成。 */
    public requestNewCode(): void {
        if (this.onRequestNewCode) {
            this.onRequestNewCode();
            return;
        }

        this.refresh();
    }

    /** 设置全局默认字体（TTF/FNT，业务启动时注入一次，例如 LanguageData.font）；实例 defaultLabelFont 优先于它。 */
    public static setDefaultLabelFont(font: Font | null): void {
        CaptchaView.defaultLabelFont = font;
    }

    /**
     * 服务端图片模式：用服务端返回的验证码图片（100/1004 的 imageBase64，PNG）替代本地随机图形。
     *
     * 参数可以是裸 base64，也可以是 `data:image/png;base64,...` 形式的 data URI。
     * 成功后本地字符与干扰层会被清掉，图片按内容区域等比居中显示。
     *
     * @returns 是否渲染成功；图片为空或当前平台解不出该图片时返回 false（本地图形不受影响）。
     */
    public async setServerImage(imageBase64: string): Promise<boolean> {
        const source = CaptchaView.toImageSource(imageBase64);
        if (!source) {
            console.warn('[CaptchaView] 服务端验证码图片为空');
            return false;
        }

        const imageAsset = await CaptchaView.loadImageAsset(source);
        if (!imageAsset) {
            return false;
        }

        const texture = new Texture2D();
        texture.image = imageAsset;

        const spriteFrame = new SpriteFrame();
        spriteFrame.texture = texture;
        spriteFrame.rect = new Rect(0, 0, texture.width, texture.height);

        return this.applyServerSpriteFrame(spriteFrame);
    }

    /** 清掉服务端图片，回到本地随机图形模式（不自动重新生成）。 */
    public clearServerImage(): void {
        const node = this.serverImageNode;
        this.serverImageNode = null;
        if (node?.isValid) {
            node.removeFromParent();
            node.destroy();
        }
    }

    // ---------------------------------------------------------------------
    // 服务端图片：编码转换与加载
    // ---------------------------------------------------------------------

    /** 把服务端图片贴到验证码节点上（等比居中），并清掉本地生成的字符与干扰层。 */
    private applyServerSpriteFrame(spriteFrame: SpriteFrame): boolean {
        // 服务端图片与本地随机图形互斥：先清掉本地生成的字符/干扰，再挂图片节点。
        this.node.removeAllChildren();
        this.currentCode = '';
        this.serverImageNode = null;

        const rect = this.resolveContentRect();
        const contentWidth = rect.right - rect.left;
        const contentHeight = rect.top - rect.bottom;
        const frameWidth = spriteFrame.width || contentWidth;
        const frameHeight = spriteFrame.height || contentHeight;
        // 等比缩放，避免服务端图片比例与节点不一致时被拉伸。
        const fit = Math.min(contentWidth / frameWidth, contentHeight / frameHeight) || 1;

        const imageNode = new Node(CaptchaView.SERVER_IMAGE_NODE_NAME);
        imageNode.layer = this.node.layer; // 跟随父节点（UI_2D）
        imageNode.addComponent(UITransform).setContentSize(frameWidth * fit, frameHeight * fit);

        const sprite = imageNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = spriteFrame;

        imageNode.setPosition((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
        this.node.addChild(imageNode);
        this.serverImageNode = imageNode;
        return true;
    }

    /** 裸 base64 / data URI 统一转成可直接喂给图片通道的 source；空值返回空串。 */
    private static toImageSource(imageBase64: string): string {
        const trimmed = (imageBase64 || '').trim();
        if (!trimmed) {
            return '';
        }
        if (/^data:image\//i.test(trimmed)) {
            return trimmed;
        }

        return `data:${CaptchaView.sniffImageMime(trimmed)};base64,${trimmed}`;
    }

    /** 按 base64 头部嗅探图片类型；服务端已改为 PNG，识别不出时按 PNG 处理。 */
    private static sniffImageMime(base64: string): string {
        if (base64.startsWith('iVBORw0KGgo')) {
            return 'image/png';
        }
        if (base64.startsWith('/9j/')) {
            return 'image/jpeg';
        }
        if (base64.startsWith('R0lGOD')) {
            return 'image/gif';
        }
        if (base64.startsWith('UklGR')) {
            return 'image/webp';
        }
        // "PHN2" = "<sv"，"PD94bWw" = "<?xml"：历史遗留的 SVG（引擎解不了，保留识别便于排查）
        if (base64.startsWith('PHN2') || base64.startsWith('PD94bWw')) {
            return 'image/svg+xml';
        }

        return 'image/png';
    }

    /** 按平台选取解码通道：原生端喂字节流，其余平台走 DOM 图片通道。 */
    private static loadImageAsset(source: string): Promise<ImageAsset | null> {
        if (sys.isNative) {
            return Promise.resolve(CaptchaView.createImageAssetFromBytes(source));
        }

        return CaptchaView.loadRemoteImageAsset(source);
    }

    /**
     * 原生端：把 PNG 编码字节直接交给引擎解码。
     *
     * 原生没有 DOM Image，`data:` URL 走不通；`ImageAsset` 的内存图源路径需要自己带准确宽高
     * （原生 `_syncDataToNative` 直接取 `data.width/height`），这里从 PNG 的 IHDR 里读。
     */
    private static createImageAssetFromBytes(source: string): ImageAsset | null {
        try {
            const bytes = CaptchaView.decodeBase64(CaptchaView.stripDataUriPrefix(source));
            const size = bytes ? CaptchaView.readPngSize(bytes) : null;
            if (!bytes || !size) {
                console.warn('[CaptchaView] 服务端验证码图片不是可识别的 PNG');
                return null;
            }

            // 引擎的 IMemoryImageSource 没从 'cc' 导出类型，这里按结构体传入。
            return new ImageAsset({
                _data: bytes,
                _compressed: true,
                width: size.width,
                height: size.height,
                format: Texture2D.PixelFormat.RGBA8888,
            } as any);
        } catch (error) {
            console.warn('[CaptchaView] 服务端验证码图片解码异常', error);
            return null;
        }
    }

    /** Web / 小游戏：data URI 交给 DOM 图片通道（`img.src = data:image/png;base64,...`）。 */
    private static loadRemoteImageAsset(source: string): Promise<ImageAsset | null> {
        // 引擎的图片远程通道（downloadDomImage）依赖 DOM Image，没有就直接失败，
        // 避免在异步管线里抛出难以定位的异常。
        if (typeof Image === 'undefined') {
            console.warn('[CaptchaView] 当前平台没有 DOM Image，无法解码 data URI 验证码图片');
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            let isSettled = false;
            const finish = (imageAsset: ImageAsset | null) => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                resolve(imageAsset);
            };

            try {
                assetManager.loadRemote<ImageAsset>(
                    source,
                    { ext: CaptchaView.REMOTE_IMAGE_EXT },
                    (error, imageAsset) => {
                        if (error || !imageAsset) {
                            console.warn('[CaptchaView] 服务端验证码图片加载失败', error);
                            finish(null);
                            return;
                        }

                        finish(imageAsset);
                    },
                );
            } catch (error) {
                console.warn('[CaptchaView] 服务端验证码图片加载异常', error);
                finish(null);
            }
        });
    }

    private static stripDataUriPrefix(source: string): string {
        return source.replace(/^data:[^,]*,/, '');
    }

    /** base64 → 字节流；解码失败返回 null。 */
    private static decodeBase64(base64: string): Uint8Array | null {
        try {
            const binary = ZlibUtils.robustAtob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            return bytes;
        } catch (error) {
            console.warn('[CaptchaView] 服务端验证码图片 base64 解码失败', error);
            return null;
        }
    }

    /**
     * 从 PNG 字节流里读出尺寸。
     *
     * 结构：8 字节签名 `89 50 4E 47 0D 0A 1A 0A` + 4 字节块长度 + 4 字节块类型 "IHDR"，
     * 紧接着就是宽、高两个大端 uint32（偏移 16 / 20）。
     */
    private static readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
        if (bytes.length < 24
            || bytes[0] !== 0x89
            || bytes[1] !== 0x50
            || bytes[2] !== 0x4E
            || bytes[3] !== 0x47) {
            return null;
        }

        const width = CaptchaView.readUint32BE(bytes, 16);
        const height = CaptchaView.readUint32BE(bytes, 20);
        if (width <= 0 || height <= 0) {
            return null;
        }

        return { width, height };
    }

    private static readUint32BE(bytes: Uint8Array, offset: number): number {
        return ((bytes[offset] << 24)
            | (bytes[offset + 1] << 16)
            | (bytes[offset + 2] << 8)
            | bytes[offset + 3]) >>> 0;
    }

    // ---------------------------------------------------------------------
    // 生成与渲染
    // ---------------------------------------------------------------------

    private resolveCodeLength(): number {
        const maxAllowed = Math.max(1, this.effectiveCharSet.length);
        const requested = this.codeLength > 0 ? Math.floor(this.codeLength) : 4;
        return Math.max(1, Math.min(maxAllowed, requested));
    }

    private normalizeCharSet(charSet: string): string {
        const trimmed = (charSet || '').trim();
        return trimmed.length > 0 ? trimmed : '0123456789';
    }

    private generateCode(length: number, charSet: string): string {
        let code = '';
        for (let i = 0; i < length; i++) {
            code += charSet.charAt(Math.floor(Math.random() * charSet.length));
        }
        return code;
    }

    private rebuildView(): void {
        // 本地图形与服务端图片互斥：重新画本地字符前先摘掉服务端图片节点。
        this.clearServerImage();
        this.node.removeAllChildren();

        const rect = this.resolveContentRect();
        const contentWidth = rect.right - rect.left;
        const contentHeight = rect.top - rect.bottom;
        const centerY = (rect.top + rect.bottom) / 2;

        const charSet = this.effectiveCharSet;
        const useFrames = this.digitFrames.length >= charSet.length;
        const digitColorPool = this.resolveColorPool(this.textColors, CaptchaView.DEFAULT_DIGIT_COLORS);

        // 字符在父节点内容区域内等宽分槽、垂直居中抖动；不假设锚点是中心。
        const slotWidth = (contentWidth * 0.88) / this.effectiveLength;
        const slotStartX = rect.left + contentWidth * 0.06;
        const yJitterAmount = contentHeight * (CaptchaView.MAX_Y_JITTER / 2);

        for (let i = 0; i < this.effectiveLength; i++) {
            const char = this.currentCode.charAt(i);
            const charIndex = charSet.indexOf(char);
            const color = CaptchaView.pick(digitColorPool);

            const node = useFrames
                ? this.createCharSprite(char, charIndex, color)
                : this.createCharLabel(char, color, contentHeight);

            const slotCenterX = slotStartX + slotWidth * (i + 0.5);
            const jitterX = CaptchaView.randomRange(-slotWidth * CaptchaView.MAX_X_JITTER, slotWidth * CaptchaView.MAX_X_JITTER);
            const y = centerY + CaptchaView.randomRange(-yJitterAmount, yJitterAmount);
            node.setPosition(slotCenterX + jitterX, y);
            node.angle = CaptchaView.randomRange(-CaptchaView.MAX_ROTATION, CaptchaView.MAX_ROTATION);

            this.node.addChild(node);
        }

        this.node.addChild(this.createNoiseNode(rect));
    }

    private createCharSprite(char: string, charIndex: number, color: Color): Node {
        const frame = charIndex >= 0
            ? (this.digitFrames[charIndex] ?? this.digitFrames[0])
            : null;
        const node = new Node(`char_${char}`);
        node.layer = this.node.layer; // 跟随父节点（UI_2D）
        node.addComponent(UITransform).setContentSize(frame?.width ?? 0, frame?.height ?? 0);
        const sprite = node.addComponent(Sprite);
        sprite.spriteFrame = frame ?? null;
        sprite.color = color;
        // 随机微缩放，模拟大小不一的手写感。
        node.scale = Vec3.ONE.clone().multiplyScalar(CaptchaView.randomRange(0.85, 1.2));
        return node;
    }

    private createCharLabel(char: string, color: Color, height: number): Node {
        const node = new Node(`char_${char}`);
        node.layer = this.node.layer; // 跟随父节点（UI_2D）
        node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = char;
        label.color = color;
        label.font = this.defaultLabelFont ?? CaptchaView.defaultLabelFont ?? null;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.isBold = Math.random() < 0.35;
        const baseSize = Math.max(16, Math.min(72, height * 0.55));
        label.fontSize = baseSize * CaptchaView.randomRange(0.85, 1.18);
        label.lineHeight = label.fontSize * 1.2;
        return node;
    }

    /** 干扰层：几条随机折线 + 圆点，覆盖在字符上层，坐标按父节点内容区域绘制。 */
    private createNoiseNode(rect: CaptchaRect): Node {
        const node = new Node('noise');
        node.layer = this.node.layer; // 跟随父节点（UI_2D）
        node.addComponent(UITransform).setContentSize(rect.right - rect.left, rect.top - rect.bottom);

        const g = node.addComponent(Graphics);
        const contentWidth = rect.right - rect.left;
        const contentHeight = rect.top - rect.bottom;
        const noiseColorPool = this.resolveColorPool(this.noiseColors, CaptchaView.DEFAULT_NOISE_COLORS);

        g.lineWidth = CaptchaView.randomRange(1, 2);
        const lineCount = 3 + Math.floor(Math.random() * 3); // 3~5 条
        for (let i = 0; i < lineCount; i++) {
            const color = CaptchaView.pick(noiseColorPool).clone();
            color.a = Math.floor(CaptchaView.randomRange(70, 140));
            g.strokeColor = color;

            let x = CaptchaView.randomRange(rect.left, rect.right);
            let y = CaptchaView.randomRange(rect.bottom, rect.top);
            g.moveTo(x, y);
            const segmentCount = 2 + Math.floor(Math.random() * 3); // 每条约 2~4 段
            for (let s = 0; s < segmentCount; s++) {
                x += CaptchaView.randomRange(-contentWidth * 0.16, contentWidth * 0.16);
                y += CaptchaView.randomRange(-contentHeight * 0.16, contentHeight * 0.16);
                g.lineTo(
                    CaptchaView.clamp(x, rect.left, rect.right),
                    CaptchaView.clamp(y, rect.bottom, rect.top),
                );
            }
            g.stroke();
        }

        const dotCount = 4 + Math.floor(Math.random() * 6); // 4~9 个点
        for (let i = 0; i < dotCount; i++) {
            const color = CaptchaView.pick(noiseColorPool).clone();
            color.a = Math.floor(CaptchaView.randomRange(80, 160));
            g.fillColor = color;
            g.circle(
                CaptchaView.randomRange(rect.left, rect.right),
                CaptchaView.randomRange(rect.bottom, rect.top),
                CaptchaView.randomRange(1, 3),
            );
            g.fill();
        }

        return node;
    }

    /**
     * 把父节点 UITransform 的内容区域换算成节点本地坐标矩形。
     * 不假设锚点为中心：锚点 (0.5, 0.5) 时 left=-w/2；锚点 (1, 0.5) 时 left=-w、right=0。
     */
    private resolveContentRect(): CaptchaRect {
        const transform = this.node.getComponent(UITransform);
        const width = (transform && transform.width > 0) ? transform.width : Math.max(40, this.fallbackSize.width);
        const height = (transform && transform.height > 0) ? transform.height : Math.max(20, this.fallbackSize.height);
        const anchorX = transform ? transform.anchorX : 0.5;
        const anchorY = transform ? transform.anchorY : 0.5;

        return {
            left: -anchorX * width,
            right: (1 - anchorX) * width,
            bottom: -anchorY * height,
            top: (1 - anchorY) * height,
        };
    }

    private resolveColorPool(colors: Color[], defaults: ReadonlyArray<Color>): Color[] {
        return colors.length > 0 ? colors : defaults.slice();
    }

    private onTouchRefresh(): void {
        this.requestNewCode();
    }

    // ---------------------------------------------------------------------
    // 随机工具
    // ---------------------------------------------------------------------

    private static randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private static pick<T>(list: ReadonlyArray<T>): T {
        return list[Math.floor(Math.random() * list.length)];
    }

    /** 内置浅色系字符色（深色背景上可读）。 */
    private static readonly DEFAULT_DIGIT_COLORS: ReadonlyArray<Color> = [
        new Color(245, 247, 250, 255),
        new Color(220, 233, 255, 255),
        new Color(255, 227, 194, 255),
        new Color(217, 247, 227, 255),
        new Color(255, 214, 222, 255),
        new Color(231, 219, 255, 255),
        new Color(191, 227, 255, 255),
        new Color(255, 243, 191, 255),
    ];

    /** 内置干扰线/点色。 */
    private static readonly DEFAULT_NOISE_COLORS: ReadonlyArray<Color> = [
        new Color(58, 63, 71, 255),
        new Color(91, 100, 112, 255),
        new Color(122, 132, 148, 255),
        new Color(165, 176, 190, 255),
        new Color(138, 147, 163, 255),
    ];
}
