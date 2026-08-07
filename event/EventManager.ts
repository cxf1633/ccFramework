import { EventTarget } from 'cc';

export class EventManager {
    private static eventTarget = new EventTarget(); // cocos 自带轻量级全局事件 不需要多余的节点node开销

    // private static get eventTarget(): Node {
    //     if (!this._eventTarget || !this._eventTarget.isValid) {
    //         this._eventTarget = new Node("EventManager");
    //         director.addPersistRootNode(this._eventTarget);
    //     }
    //     return this._eventTarget;
    // }

    /**
     * 发送全局事件
     * @param eventName 事件名称
     * @param args 事件参数
     */
    public static emit(eventName: string, ...args: any[]) {
        this.eventTarget.emit(eventName, ...args);
    }

    /**
     * 监听全局事件
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调函数的this指向
     */
    public static on(eventName: string, callback: any, target?: any) {
        this.eventTarget.on(eventName, callback, target);
    }

    /**
     * 取消监听全局事件
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调函数的this指向
     */
    public static off(eventName: string, callback: any, target?: any) {
        this.eventTarget.off(eventName, callback, target);
    }

    /**
     * 在当前 EventTarget 上删除指定目标（target 参数）注册的所有事件监听器。
     * @param target 回调函数的this指向
     */
    public static targetOff(target: any) {
        this.eventTarget.targetOff(target);
    }
}
