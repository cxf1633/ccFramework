import { Logger } from "../log/Logger";

/**
 * Local message bus for app/game events and server push dispatch.
 */
export type MessageHandler = (this: any, type: string, message: any) => void;

interface MessageListenerEntry {
    handler: MessageHandler;
    owner?: object;
}

export class MessageManager {
    private static instance: MessageManager | null = null;
    private listeners: Map<string, MessageListenerEntry[]> = new Map();

    private constructor() { }

    public static getInstance(): MessageManager {
        if (!MessageManager.instance) {
            MessageManager.instance = new MessageManager();
        }
        return MessageManager.instance;
    }

    public on(messageType: string, handler: MessageHandler, owner?: object): () => void {
        if (!this.listeners.has(messageType)) {
            this.listeners.set(messageType, []);
        }

        const entries = this.listeners.get(messageType)!;
        const exists = entries.some((entry) => entry.handler === handler && entry.owner === owner);
        if (!exists) {
            entries.push({ handler, owner });
        }

        return () => this.off(messageType, handler, owner);
    }

    public once(messageType: string, handler: MessageHandler, owner?: object): () => void {
        const onceHandler: MessageHandler = function (this: any, type: string, message: any) {
            off();
            handler.call(this, type, message);
        };
        const off = this.on(messageType, onceHandler, owner);
        return off;
    }

    public off(messageType: string, handler?: MessageHandler, owner?: object): void {
        const entries = this.listeners.get(messageType);
        if (!entries) {
            return;
        }

        const nextEntries = entries.filter((entry) => {
            if (handler && entry.handler !== handler) {
                return true;
            }
            if (owner && entry.owner !== owner) {
                return true;
            }
            return false;
        });

        if (nextEntries.length === 0) {
            this.listeners.delete(messageType);
        } else {
            this.listeners.set(messageType, nextEntries);
        }
    }

    public removeAllListeners(messageType: string): void {
        if (this.listeners.has(messageType)) {
            this.listeners.delete(messageType);
            Logger.netLog(`remove all message listeners: ${messageType}`);
        }
    }

    public dispatchMessage(messageType: string, message: any = null): void {
        const entries = this.listeners.get(messageType);

        // Logger.netLog("[事件消息]", messageType, message);
        Logger.netLog("[事件消息]", messageType, ...(message == null ? [] : [JSON.stringify(message)]));

        if (entries && entries.length > 0) {
            entries.slice().forEach((entry) => {
                try {
                    entry.handler.call(entry.owner ?? null, messageType, message);
                } catch (e) {
                    const ownerName = entry.owner?.constructor?.name || "anonymous";
                    console.error(`message listener ${ownerName} failed:`, e);
                }
            });
        }
    }

    public getListenerCount(messageType: string): number {
        const entries = this.listeners.get(messageType);
        return entries ? entries.length : 0;
    }
}

export const message = MessageManager.getInstance();
