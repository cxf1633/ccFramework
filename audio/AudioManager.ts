import { AudioClip, AudioSource, Node, sys } from "cc";

declare const wx: any;

export type AudioChannelId = string;
export type AudioBackend = "cocos" | "native" | "auto";

export interface AudioPlayOptions {
    loop?: boolean;
    volume?: number;
    restart?: boolean;
    backend?: AudioBackend;
}

export interface AudioSourceOptions {
    loop?: boolean;
    volume?: number;
    currentTime?: number;
}

interface AudioChannel {
    source: AudioSource;
    clip: AudioClip | null;
    loop: boolean;
    volume: number;
    nativeContext: WeChatAudioContextRecord | null;
}

interface WeChatAudioContextRecord {
    target: any;
    status: 0 | 1 | -1;
    onEnded?: () => void;
    onError?: (err: any) => void;
}

export class AudioManager {
    private hostNode: Node | null = null;
    private readonly channels: Map<AudioChannelId, AudioChannel> = new Map();
    private readonly nativeAudioPool: WeChatAudioContextRecord[] = [];

    public initialize(hostNode: Node): void {
        if (this.hostNode === hostNode) return;
        this.dispose();
        this.hostNode = hostNode;
    }

    public createChannel(channelId: AudioChannelId): void {
        this.getOrCreateChannel(channelId);
    }

    public removeChannel(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        this.stopNativeChannel(channel);
        channel.source.stop();
        channel.source.destroy();
        this.channels.delete(channelId);
    }

    public hasChannel(channelId: AudioChannelId): boolean {
        return this.channels.has(channelId);
    }

    public setSource(channelId: AudioChannelId, clip: AudioClip | null, options: AudioSourceOptions = {}): void {
        const channel = this.getOrCreateChannel(channelId);
        channel.clip = clip;
        channel.source.clip = clip;

        if (options.loop !== undefined) {
            channel.loop = options.loop;
            channel.source.loop = options.loop;
        }

        if (options.volume !== undefined) {
            channel.volume = this.normalizeVolume(options.volume);
            channel.source.volume = channel.volume;
        }

        if (options.currentTime !== undefined) {
            this.seek(channelId, options.currentTime);
        }
    }

    public getSource(channelId: AudioChannelId): AudioClip | null {
        return this.channels.get(channelId)?.clip || null;
    }

    public play(channelId: AudioChannelId, options: AudioPlayOptions = {}): void {
        const channel = this.getOrCreateChannel(channelId);
        if (!channel.clip) return;

        if (options.loop !== undefined) {
            channel.loop = options.loop;
            channel.source.loop = options.loop;
        }

        if (options.volume !== undefined) {
            channel.volume = this.normalizeVolume(options.volume);
            channel.source.volume = channel.volume;
        }

        const backend = options.backend || "cocos";
        if (backend === "native" || backend === "auto" && this.shouldUseNativeAudio()) {
            this.playNativeChannel(channel, options.restart !== false);
            return;
        }

        this.stopNativeChannel(channel);
        if (options.restart !== false) channel.source.stop();
        channel.source.play();
    }

    public pause(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        if (channel.nativeContext) {
            channel.nativeContext.target?.pause?.();
            return;
        }

        channel.source.pause();
    }

    public resume(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        if (channel.nativeContext) {
            channel.nativeContext.target?.play?.();
            return;
        }

        channel.source.play();
    }

    public stop(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        this.stopNativeChannel(channel);
        channel.source.stop();
    }

    public seek(channelId: AudioChannelId, time: number): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        const safeTime = Math.max(0, time);
        if (channel.nativeContext) {
            channel.nativeContext.target?.seek?.(safeTime);
            return;
        }

        channel.source.currentTime = safeTime;
    }

    public setVolume(channelId: AudioChannelId, volume: number): void {
        const channel = this.getOrCreateChannel(channelId);
        channel.volume = this.normalizeVolume(volume);
        channel.source.volume = channel.volume;
        if (channel.nativeContext) channel.nativeContext.target.volume = channel.volume;
    }

    public getVolume(channelId: AudioChannelId): number {
        return this.channels.get(channelId)?.volume ?? 1;
    }

    public setLoop(channelId: AudioChannelId, loop: boolean): void {
        const channel = this.getOrCreateChannel(channelId);
        channel.loop = loop;
        channel.source.loop = loop;
        if (channel.nativeContext) channel.nativeContext.target.loop = loop;
    }

    public isPlaying(channelId: AudioChannelId): boolean {
        const channel = this.channels.get(channelId);
        if (!channel) return false;
        if (channel.nativeContext) return channel.nativeContext.status === 1;
        return channel.source.playing;
    }

    public playOneShot(clip: AudioClip, volume: number = 1, backend: AudioBackend = "auto"): void {
        const finalVolume = this.normalizeVolume(volume);
        if (backend === "native" || backend === "auto" && this.shouldUseNativeAudio()) {
            this.playNativeClip(clip, finalVolume, false);
            return;
        }

        const channel = this.getOrCreateChannel("__oneShot__");
        channel.source.playOneShot(clip, finalVolume);
    }

    public stopAll(): void {
        this.channels.forEach((channel) => {
            this.stopNativeChannel(channel);
            channel.source.stop();
        });
    }

    public dispose(): void {
        this.stopAll();
        this.channels.forEach((channel) => channel.source.destroy());
        this.channels.clear();
        this.destroyNativePool();
        this.hostNode = null;
    }

    private getOrCreateChannel(channelId: AudioChannelId): AudioChannel {
        const oldChannel = this.channels.get(channelId);
        if (oldChannel) return oldChannel;

        if (!this.hostNode) {
            throw new Error("AudioManager must be initialized before creating audio channels.");
        }

        const source = this.hostNode.addComponent(AudioSource);
        const channel: AudioChannel = {
            source,
            clip: null,
            loop: false,
            volume: 1,
            nativeContext: null,
        };
        this.channels.set(channelId, channel);
        return channel;
    }

    private playNativeChannel(channel: AudioChannel, restart: boolean): void {
        if (!channel.clip) return;
        if (restart) this.stopNativeChannel(channel);

        const context = channel.nativeContext || this.acquireNativeContext();
        channel.nativeContext = context;
        this.playNativeContext(context, channel.clip, channel.volume, channel.loop, () => {
            if (channel.nativeContext === context) channel.nativeContext = null;
        });
    }

    private stopNativeChannel(channel: AudioChannel): void {
        const context = channel.nativeContext;
        if (!context) return;

        context.target?.stop?.();
        this.releaseNativeContext(context);
        channel.nativeContext = null;
    }

    private playNativeClip(clip: AudioClip, volume: number, loop: boolean): void {
        const context = this.acquireNativeContext();
        this.playNativeContext(context, clip, volume, loop);
    }

    private playNativeContext(context: WeChatAudioContextRecord, clip: AudioClip, volume: number, loop: boolean, onEnded?: () => void): void {
        this.clearNativeListeners(context);
        context.status = 1;
        context.target.src = clip.nativeUrl;
        context.target.volume = volume;
        context.target.loop = loop;

        context.onEnded = () => {
            onEnded?.();
            this.releaseNativeContext(context);
        };
        context.onError = (err: any) => {
            console.error("Native audio play failed:", err);
            context.status = -1;
            onEnded?.();
        };

        context.target.onEnded?.(context.onEnded);
        context.target.onError?.(context.onError);
        context.target.play?.();
    }

    private acquireNativeContext(): WeChatAudioContextRecord {
        for (let i = this.nativeAudioPool.length - 1; i >= 0; i--) {
            const context = this.nativeAudioPool[i];
            if (context.status === -1) {
                this.nativeAudioPool.splice(i, 1);
                this.destroyNativeContext(context);
                continue;
            }

            if (context.status === 0) {
                context.status = 1;
                return context;
            }
        }

        const context: WeChatAudioContextRecord = {
            target: wx.createInnerAudioContext(),
            status: 1,
        };
        this.nativeAudioPool.push(context);
        return context;
    }

    private releaseNativeContext(context: WeChatAudioContextRecord): void {
        this.clearNativeListeners(context);
        if (context.status !== -1) context.status = 0;
    }

    private clearNativeListeners(context: WeChatAudioContextRecord): void {
        if (context.onEnded) context.target.offEnded?.(context.onEnded);
        if (context.onError) context.target.offError?.(context.onError);
        context.onEnded = undefined;
        context.onError = undefined;
    }

    private destroyNativePool(): void {
        this.nativeAudioPool.forEach((context) => this.destroyNativeContext(context));
        this.nativeAudioPool.length = 0;
    }

    private destroyNativeContext(context: WeChatAudioContextRecord): void {
        this.clearNativeListeners(context);
        try {
            context.target?.stop?.();
            context.target?.destroy?.();
        } catch (err) {
            console.warn("Destroy native audio failed:", err);
        }
    }

    private shouldUseNativeAudio(): boolean {
        return sys.platform === sys.Platform.WECHAT_GAME || sys.platform === sys.Platform.WECHAT_MINI_PROGRAM;
    }

    private normalizeVolume(volume: number): number {
        return Math.max(0, Math.min(1, volume));
    }
}
