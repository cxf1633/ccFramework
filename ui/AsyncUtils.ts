import { Component, Node } from "cc";
import { message } from "../event/MessageManager";
import { Logger } from "../log/Logger";

export class AsyncUtils {
    /**
     * 等待指定秒数
     * @param component 调用此方法的组件实例，用于调度
     * @param seconds 等待的秒数
     * @returns true 表示正常等待完成；false 表示等待期间组件被禁用或销毁
     */
    static WaitForSeconds(component: Component, seconds: number): Promise<boolean> {
        return new Promise((resolve) => {
            let timeoutId: number = -1;
            let isResolved = false;
            const node = component.node;
            const nodeDestroyedEvent = (Node.EventType as any).NODE_DESTROYED;

            function cleanup() {
                if (timeoutId !== -1) {
                    clearTimeout(timeoutId);
                    timeoutId = -1;
                }
                if (node?.isValid) {
                    node.off(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onActiveChanged);
                    if (nodeDestroyedEvent) {
                        node.off(nodeDestroyedEvent, finishCanceled);
                    }
                }
            }

            function finish(completed: boolean) {
                if (isResolved) {
                    return;
                }

                isResolved = true;
                cleanup();
                resolve(completed && component.isValid && !!node?.isValid && node.activeInHierarchy);
            }

            function finishCanceled() {
                finish(false);
            }

            function onActiveChanged() {
                if (!node?.isValid || !node.activeInHierarchy) {
                    finish(false);
                }
            }

            if (!component.isValid || !node?.isValid || !node.activeInHierarchy) {
                resolve(false);
                return;
            }

            node.on(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onActiveChanged);
            if (nodeDestroyedEvent) {
                node.once(nodeDestroyedEvent, finishCanceled);
            }
            timeoutId = setTimeout(() => finish(true), Math.max(0, seconds) * 1000);
        });
    }

    /**
     * 等待特定事件触发
     * @param component 调用此方法的组件实例，用于监听节点生命周期
     * @param event 事件名称
     * @param expectedData 期望的数据
     * @returns true 表示事件正常触发；false 表示等待期间组件被禁用或销毁
     */
    static WaitForEvent(component: Component, event: string, expectedData: any = null): Promise<boolean> {
        const node = component.node;
        const nodeDestroyedEvent = (Node.EventType as any).NODE_DESTROYED;

        Logger.log(`等待事件: ${event}, 期望数据: ${expectedData}`);
        return new Promise((resolve) => {
            let isResolved = false;

            function cleanup() {
                message.off(event, handler, null);
                if (node?.isValid) {
                    node.off(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onActiveChanged);
                    if (nodeDestroyedEvent) {
                        node.off(nodeDestroyedEvent, finishCanceled);
                    }
                }
            }

            function finish(completed: boolean) {
                if (isResolved) {
                    return;
                }

                isResolved = true;
                cleanup();
                resolve(completed && component.isValid && !!node?.isValid && node.activeInHierarchy);
            }

            function finishCanceled() {
                finish(false);
            }

            function onActiveChanged() {
                if (!node?.isValid || !node.activeInHierarchy) {
                    finish(false);
                }
            }

            function handler(eventName: string, receivedData: any) {
                // 如果已经解析过，直接返回
                if (isResolved) return;

                // 如果没有指定期望的数据，则任何消息都会触发
                if (expectedData === null) {
                    finish(true);
                    return;
                }

                // 比较接收到的数据与期望的数据
                if (receivedData === expectedData) {
                    finish(true);
                }
                // 如果数据不匹配，继续等待
            }

            if (!component.isValid || !node?.isValid || !node.activeInHierarchy) {
                resolve(false);
                return;
            }

            message.on(event, handler, null);
            if (node?.isValid) {
                node.on(Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED, onActiveChanged);
                if (nodeDestroyedEvent) {
                    node.once(nodeDestroyedEvent, finishCanceled);
                }
            }
        });
    }
    /**
     * 触发事件
     * @param event 事件名称
     * @param expectedData 期望的数据
     */
    static ResolveEvent(event: string, expectedData: any = null) {
        Logger.log(`触发事件: ${event}, 数据: ${expectedData}`);
        message.dispatchMessage(event, expectedData);
    }
}
