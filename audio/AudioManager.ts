import { AudioClip, AudioSource, Node } from "cc";

export type AudioChannelId = string;

export interface AudioPlayOptions {
    loop?: boolean;
    volume?: number;
    restart?: boolean;
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
}

export class AudioManager {
    private hostNode: Node | null = null;
    private readonly channels: Map<AudioChannelId, AudioChannel> = new Map();
    private readonly independentSources: Set<AudioSource> = new Set();

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

        if (options.restart !== false) channel.source.stop();
        channel.source.play();
    }

    public pause(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.source.pause();
    }

    public resume(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.source.play();
    }

    public stop(channelId: AudioChannelId): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        channel.source.stop();
    }

    public seek(channelId: AudioChannelId, time: number): void {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        const safeTime = Math.max(0, time);
        channel.source.currentTime = safeTime;
    }

    public setVolume(channelId: AudioChannelId, volume: number): void {
        const channel = this.getOrCreateChannel(channelId);
        channel.volume = this.normalizeVolume(volume);
        channel.source.volume = channel.volume;
    }

    public getVolume(channelId: AudioChannelId): number {
        return this.channels.get(channelId)?.volume ?? 1;
    }

    public setLoop(channelId: AudioChannelId, loop: boolean): void {
        const channel = this.getOrCreateChannel(channelId);
        channel.loop = loop;
        channel.source.loop = loop;
    }

    public isPlaying(channelId: AudioChannelId): boolean {
        const channel = this.channels.get(channelId);
        if (!channel) return false;
        return channel.source.playing;
    }

    public playOneShot(
        clip: AudioClip,
        volume: number = 1,
        uninterrupted: boolean = false,
    ): void {
        const finalVolume = this.normalizeVolume(volume);
        if (uninterrupted) {
            this.playIndependentCocosClip(clip, finalVolume);
            return;
        }

        const channel = this.getOrCreateChannel("__oneShot__");
        channel.source.playOneShot(clip, finalVolume);
    }

    public stopAll(): void {
        this.channels.forEach((channel) => {
            channel.source.stop();
        });
        this.independentSources.forEach((source) => this.releaseIndependentSource(source));
    }

    public dispose(): void {
        this.stopAll();
        this.channels.forEach((channel) => channel.source.destroy());
        this.channels.clear();
        this.hostNode = null;
    }

    private getOrCreateChannel(channelId: AudioChannelId): AudioChannel {
        const oldChannel = this.channels.get(channelId);
        if (oldChannel) return oldChannel;

        if (!this.hostNode) {
            throw new Error("AudioManager must be initialized before creating audio channels.");
        }

        const source = this.hostNode.addComponent(AudioSource);
        source.playOnAwake = false;
        const channel: AudioChannel = {
            source,
            clip: null,
            loop: false,
            volume: 1,
        };
        this.channels.set(channelId, channel);
        return channel;
    }

    private playIndependentCocosClip(clip: AudioClip, volume: number): void {
        if (!this.hostNode) {
            throw new Error("AudioManager must be initialized before playing audio.");
        }

        const source = this.hostNode.addComponent(AudioSource);
        source.playOnAwake = false;
        source.clip = clip;
        source.loop = false;
        source.volume = volume;
        this.independentSources.add(source);
        source.play();
        source.scheduleOnce(
            () => this.releaseIndependentSource(source),
            Math.max(0, clip.getDuration()) + 0.1,
        );
    }

    private releaseIndependentSource(source: AudioSource): void {
        this.independentSources.delete(source);
        if (!source?.isValid) {
            return;
        }

        source.stop();
        source.destroy();
    }

    private normalizeVolume(volume: number): number {
        return Math.max(0, Math.min(1, volume));
    }
}
