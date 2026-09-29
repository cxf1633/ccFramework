import { SpriteFrame } from 'cc';
import { Vec3 } from 'cc';
import { _decorator, Component, Sprite, EventTouch, Vec2, UITransform, v2, v3, v4, Node } from 'cc';
import { Logger } from 'db://oops-framework/core/common/log/Logger';
const { ccclass, property } = _decorator;

@ccclass('PeekCardController')
export class PeekCardController extends Component {
    @property({ type: Sprite, tooltip: '背面' })
    backSprite: Sprite = null!;
    @property({ tooltip: "拖拽速度" })
    dragSpeed: number = 25;

    @property({ tooltip: "回弹速度" })
    releaseSpeed: number = 15;

    @property({ tooltip: "翻转半径" })
    radius: number = 0.1;

    private _material: any = null!;
    private _uiTransform: UITransform = null!;

    // UV 坐标系中，扑克的四个角 (左上、右上、左下、右下)
    // 注意：UV 坐标系通常左边是 0，右边是 1；上边 u=0，下边 v=1
    private _corners = [
        v2(0, 0), // 左上
        v2(1, 0), // 右上
        v2(0, 1), // 左下
        v2(1, 1), // 右下
    ];

    // 当前正在被拖拽的牌角
    private _currentCorner: Vec2 | null = null!;

    // 用于实现 Q 弹回放动画的目标位置和当前真实位置
    private _targetTouchPos: Vec2 = v2(0, 0);
    private _currentTouchPos: Vec2 = v2(0, 0);

    // 是否正在被用户手指拖拽中
    private _isDragging: boolean = false;

    start() {
        if (this.backSprite) {

            // 获取材质实例
            // 获取独立材质实例（以防多张牌共用材质互相干扰）
            this._material = this.backSprite.getMaterialInstance(0)!;
            this._uiTransform = this.backSprite.getComponent(UITransform)!;

            // 防止把牌拖拽到外面时图形被“一刀切”裁剪掉
            // 我们通过 Shader 给它四周默认扩充了安全渲染区（这里设置给上下左右扩充像素）
            if (this._material) {
                let paddingX = 200.0;
                let paddingY = 400.0;
                // v4 等效于 Vec4，将参数传递给 Shader
                this._material.setProperty('paddingData', v4(paddingX, paddingY, this._uiTransform.width, this._uiTransform.height));
                this._material.setProperty('radius', this.radius);

                // const size = this.backSprite.spriteFrame!.originalSize;
                const size = this._uiTransform.contentSize;

                // this._material.setProperty(
                //     'paddingData',
                //     v4(
                //         paddingX / size.width,
                //         paddingY / size.height,
                //         size.width,
                //         size.height
                //     )
                // )

            }
        }

        // 监听当前节点的触摸事件（可以兼容手机触摸和电脑鼠标）
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    setFace(sf: SpriteFrame | null = null) {
        if (sf) {
            this._setFaceTexture(sf);
        } else {
            console.warn(`  peekCardController initData SpriteFrame 为空`);
        }
    }

    /**
     * 将屏幕触摸点，转换为扑克牌上的 UV 坐标（0~1的范围）
     */
    private _getLocalUV(event: EventTouch): Vec2 {
        if (!this._uiTransform) return v2(0.5, 0.5);

        // 1. 获取屏幕触点位置，并转换为节点自身的局部坐标系
        let localPos = event.getUILocation();
        let nodePos = this._uiTransform.convertToNodeSpaceAR(v3(localPos.x, localPos.y, 0));

        let width = this._uiTransform.width;
        let height = this._uiTransform.height;
        let anchorX = this._uiTransform.anchorX;
        let anchorY = this._uiTransform.anchorY;

        // 2. 将局部坐标系换算成 [0, 1] 比例的 UV 值
        // U水平方向：左侧边界的X值 = -width * anchorX，由此得出百分比
        let u = (nodePos.x + width * anchorX) / width;

        // V垂直方向：Cocos的UI里上面是正的，但是 Shader 里的 UV 是上边为 0，下边为 1
        // 所以我们用 1.0 减去这个比例，做一层翻转
        let yNorm = (nodePos.y + height * anchorY) / height;
        let v = 1.0 - yNorm;

        return v2(u, v);
    }

    onTouchStart(event: EventTouch) {
        if (!this._material) return;

        // 记录手指初次按下的 UV 位置
        let uv = this._getLocalUV(event);

        // 遍历四个角，找出距离手指最近的那一个角
        let minDist = Number.MAX_VALUE;

        //强制从左下角开始
        let bestCorner = this._corners[2]// this._corners[0];

        // for (let corner of this._corners) {
        //     let dist = Vec2.distance(uv, corner);
        //     if (dist < minDist) {
        //         minDist = dist;
        //         bestCorner = corner;
        //     }
        // }

        // 标记：开始拖拽这个找到的角！
        this._currentCorner = bestCorner;
        this._isDragging = true;

        // 刚按下去的时候，立刻将两个追踪位置锁定在手指处
        this._currentTouchPos.set(uv);
        this._targetTouchPos.set(uv);

        // 把数据扔给 Shader：我要扯这个 cornerPos 角落，扯到了 touchPos 这里
        this._material.setProperty('cornerPos', this._currentCorner);
        this._material.setProperty('touchPos', this._currentTouchPos);
    }

    onTouchMove(event: EventTouch) {
        if (!this._material || !this._currentCorner) return;

        // 手指在动，我们更新“目标触点”位置，接下来的 update 会平滑地追上它
        let uv = this._getLocalUV(event);

        // ❗关键限制：只能向右翻（禁止往左拖）
        // cornerPos 是左下角，所以 x 必须 >= corner.x
        // if (uv.x < this._currentCorner.x) {
        //     uv.x = this._currentCorner.x;
        // }

        this._targetTouchPos.set(uv);
    }

    onTouchEnd(event: EventTouch) {
        if (!this._material || !this._currentCorner) return;

        // 停下拖动
        this._isDragging = false;

        // 放手后，“目标触点”强行变回原来的那个直角位置，于是扑克牌会回弹过去平铺好
        this._targetTouchPos.set(this._currentCorner);
    }

    onExternalTouchMove(globalUV: Vec2) {
        this._targetTouchPos.set(globalUV);
    }

    update(dt: number) {
        if (!this._material || !this._currentCorner) return;

        this._material.setProperty('radius', this.radius);

        // 拖拽时紧跟一点（弹性大 25.0），松手后弹回速度慢一点（阻尼感 15.0）
        let speed = this._isDragging ? this.dragSpeed : this.releaseSpeed;

        // 平滑插值 (Lerp)：让当前坐标缓缓靠近目标坐标，造就极致的 Q 弹果冻感！
        this._currentTouchPos.x += (this._targetTouchPos.x - this._currentTouchPos.x) * speed * dt;
        this._currentTouchPos.y += (this._targetTouchPos.y - this._currentTouchPos.y) * speed * dt;

        // 实时更新发给 Shader
        this._material.setProperty('touchPos', this._currentTouchPos);

        // 既然牌已经回弹到了原位，我们就重置清理掉状态，节省计算性能
        if (!this._isDragging && Vec2.distance(this._currentTouchPos, this._currentCorner) < 0.001) {
            this._currentTouchPos.set(this._currentCorner);
            this._material.setProperty('touchPos', this._currentTouchPos);
            this._currentCorner = null; // 清空标记，判定这次操作结束
        }
    }

    private _setFaceTexture(sf: SpriteFrame) {

        if (this._material == null) {
            this._material = this.backSprite.getMaterialInstance(0)!;
        }

        if (this._material == null) {
            console.warn("PeekCardController: _setFaceTexture: _material is null");
            return;
        }

        // 设置texture
        this._material.setProperty(
            "faceTexture",
            sf.texture
        );

        // 图集 rect
        const rect = sf.rect;

        // 整张图集尺寸
        const texW = sf.texture.width;
        const texH = sf.texture.height;

        // 转成 UV
        const uvX = rect.x / texW;
        const uvY = rect.y / texH;

        const uvW = rect.width / texW;
        const uvH = rect.height / texH;

        this._material.setProperty(
            "faceUVRect",
            v4(uvX, uvY, uvW, uvH)
        );
    }
}
