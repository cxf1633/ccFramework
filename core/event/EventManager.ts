import { Node, director } from 'cc';

export class EventManager {
    private static _eventTarget: Node = null;

    private static get eventTarget(): Node {
        if (!this._eventTarget || !this._eventTarget.isValid) {
            this._eventTarget = new Node("EventManager");
            director.addPersistRootNode(this._eventTarget);
        }
        return this._eventTarget;
    }

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
    public static on(eventName: string, callback: Function, target?: any) {
        this.eventTarget.on(eventName, callback, target);
    }

    /**
     * 取消监听全局事件
     * @param eventName 事件名称
     * @param callback 回调函数
     * @param target 回调函数的this指向
     */
    public static off(eventName: string, callback: Function, target?: any) {
        this.eventTarget.off(eventName, callback, target);
    }
}
