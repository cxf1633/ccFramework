import {
    _decorator,
    Component,
    Node,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('FollowTarget')
export class FollowTarget extends Component {

    @property(Node)
    target: Node | null = null;

    /**
     * 局部偏移
     */
    @property(Vec3)
    offset: Vec3 = new Vec3(0, 0, 0);

    @property
    isWorldPos: boolean = false;
    /**
     * 是否跟随位置
     */
    @property
    followPosition: boolean = true;

    /**
     * 是否跟随旋转
     */
    @property
    followRotation: boolean = false;

    /**
     * 是否跟随缩放
     */
    @property
    followScale: boolean = false;

    private _worldPos = new Vec3();

    update() {

        if (!this.target) {
            return;
        }

        // =========================
        // 跟随位置
        // =========================
        if (this.followPosition) {

            // 获取目标世界坐标
            this.target.getWorldPosition(this._worldPos);

            this.node.setWorldPosition(this._worldPos);

            // 加偏移
            // Vec3.add(this._worldPos, this._worldPos, this.offset);

            // 转换到当前父节点本地坐标
            const parent = this.node.parent;

            if (parent) {
                if (this.isWorldPos == false)
                    this.node.setPosition(this.node.position.clone().add(this.offset));
                else {
                    this.node.setWorldPosition(this.node.worldPosition.clone().add(this.offset));
                }
            }
        }

        // =========================
        // 跟随旋转
        // =========================
        if (this.followRotation) {

            this.node.setWorldRotation(
                this.target.worldRotation
            );
        }

        // =========================
        // 跟随缩放
        // =========================
        if (this.followScale) {

            this.node.setScale(
                this.target.scale
            );
        }
    }
}