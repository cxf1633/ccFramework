import { Component, Node } from "cc";
import { message } from "../event/MessageManager";
import { Logger } from "../log/Logger";

export class AsyncUtils {
    /**
     * 等待指定秒数
     * @param component 调用此方法的组件实例，用于调度
     * @param seconds 等待的秒数
     * @returns Promise<void>
     */
    static WaitForSeconds(component: Component, seconds: number): Promise<void> {
        return new Promise((resolve, reject) => {
            let isResolved = false;
            let isScheduled = false;
            let timeoutId: number = -1;

            const onDisable = () => {
                if (isScheduled && !isResolved) {
                    // 清除定时器
                    if (timeoutId !== -1) {
                        clearTimeout(timeoutId);
                        timeoutId = -1;
                    }
                    isScheduled = false;
                    // reject(new Error('Component disabled during wait'));
                }
            };

            // 监听节点禁用事件
            component.node.on(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onDisable);

            // 立即检查当前状态
            if (!component.node.activeInHierarchy) {
                component.node.off(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onDisable);
                // reject(new Error('Component is already disabled'));
                return;
            }

            isScheduled = true;
            // 使用 setTimeout 替代 scheduleOnce，这样可以更好地控制
            timeoutId = setTimeout(() => {
                if (!isResolved && component.isValid && component.node.activeInHierarchy) {
                    isResolved = true;
                    isScheduled = false;
                    timeoutId = -1;
                    component.node.off(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onDisable);
                    resolve();
                }
            }, seconds * 1000);
        });
    }

    /**
     * 等待特定事件触发
     * @param event 事件名称
     * @param expectedData 期望的数据
     * @returns Promise<void>
     */
    static WaitForEvent(event: string, expectedData: any = null): Promise<void> {
        return new Promise((resolve, reject) => {
            let isResolved = false;

            const handler = (eventName: string, receivedData: any) => {
                // 如果已经解析过，直接返回
                if (isResolved) return;

                // 如果没有指定期望的数据，则任何消息都会触发
                if (expectedData === null) {
                    isResolved = true;
                    message.off(event, handler, null);
                    resolve();
                    return;
                }

                // 比较接收到的数据与期望的数据
                if (receivedData === expectedData) {
                    isResolved = true;
                    message.off(event, handler, null);
                    resolve();
                }
                // 如果数据不匹配，继续等待
            };

            message.on(event, handler, null);
        });
    }
    /**
     * 触发事件
     * @param event 事件名称
     * @param expectedData 期望的数据
     */
    static ResolveEvent(event: string, expectedData: any = null) {
        Logger.log(`ResolveEvent: ${event}, expectedData: ${expectedData}`);
        message.dispatchMessage(event, expectedData);
    }
}
