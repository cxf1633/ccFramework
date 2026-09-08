import { AudioClip, Node } from "cc";
import { Logger } from "../log/Logger";
import { ResManager } from "../res/ResManager";
import { UIButton } from "../ui/components/UIButton";
import { AudioManager } from "./AudioManager";

export type AudioType = "music" | "sound";

export interface AudioSoundPlayOptions {
    /** 使用独立播放器，避免连续播放同一音效时后一次截断前一次。 */
    uninterrupted?: boolean;
}

export interface AudioServiceOptions {
    defaultClickSound?: string;
    preloadResources?: readonly string[];
    musicVolume?: number;
    soundVolume?: number;
    musicMuted?: boolean;
    soundMuted?: boolean;
}

const MUSIC_CHANNEL = "music";
const SOUND_CHANNEL = "sound";

/** 通用音频服务，负责资源缓存、音乐与音效播放，以及运行时音量和静音状态。 */
export class AudioService {
    private readonly nativeAudio: AudioManager = new AudioManager();
    private readonly resourceAudioClips: Map<string, AudioClip> = new Map();
    private readonly resourceAudioLoading: Map<string, Promise<AudioClip>> = new Map();
    private readonly bundleAudioClips: Map<string, AudioClip> = new Map();
    private readonly bundleAudioLoading: Map<string, Promise<AudioClip>> = new Map();
    private hostNode: Node | null = null;
    private defaultClickSound: string = "";
    private musicMuted: boolean = false;
    private soundMuted: boolean = false;
    private musicVolume: number = 1;
    private soundVolume: number = 1;
    private musicPlayVersion: number = 0;

    public constructor(private readonly res: ResManager) { }

    /** 使用宿主节点和项目音频配置初始化服务。 */
    public initialize(hostNode: Node, options: AudioServiceOptions = {}): void {
        if (this.hostNode && this.hostNode !== hostNode) {
            this.dispose();
        }

        this.hostNode = hostNode;
        this.defaultClickSound = options.defaultClickSound || "";
        this.musicVolume = this.normalizeVolume(options.musicVolume ?? 1);
        this.soundVolume = this.normalizeVolume(options.soundVolume ?? 1);
        this.musicMuted = options.musicMuted === true;
        this.soundMuted = options.soundMuted === true;

        this.nativeAudio.initialize(hostNode);
        this.nativeAudio.createChannel(MUSIC_CHANNEL);
        this.nativeAudio.createChannel(SOUND_CHANNEL);
        UIButton.setClickSoundPlayer((clip) => this.playButtonSound(clip));

        const preloadResources = options.preloadResources || [];
        void this.preloadResourceAudios(preloadResources).catch((error) => {
            Logger.warn("[AudioService] 预加载 resources 音频失败", error);
        });
    }

    /** 释放播放器、缓存和 UIButton 音效桥接。 */
    public dispose(): void {
        this.musicPlayVersion++;
        UIButton.setClickSoundPlayer(null);
        this.nativeAudio.dispose();
        this.resourceAudioClips.clear();
        this.resourceAudioLoading.clear();
        this.bundleAudioClips.clear();
        this.bundleAudioLoading.clear();
        this.hostNode = null;
    }

    /** 预加载 resources 目录下的音频。 */
    public async preloadResourceAudios(paths: readonly string[]): Promise<void> {
        await Promise.all(paths.map((path) => this.loadResourceAudio(path)));
    }

    /** 预加载指定 Bundle 内的音频。 */
    public async preloadBundleAudios(bundleName: string, paths: readonly string[]): Promise<void> {
        await Promise.all(paths.map((path) => this.loadBundleAudio(bundleName, path)));
    }

    /** 播放 resources 目录下的音效。 */
    public async playResourceSound(path: string, volume: number = 1): Promise<void> {
        const clip = await this.loadResourceAudio(path);
        this.playSoundClip(clip, volume);
    }

    /** 播放指定 Bundle 内的音效。 */
    public async playSound(
        bundleName: string,
        path: string,
        volume: number = 1,
        options: AudioSoundPlayOptions = {},
    ): Promise<void> {
        const clip = await this.loadBundleAudio(bundleName, path);
        this.playSoundClip(clip, volume, path, options);
    }

    /** 播放指定 Bundle 内的背景音乐。 */
    public async playMusic(bundleName: string, path: string, loop: boolean = true, volume: number = 1): Promise<void> {
        const playVersion = ++this.musicPlayVersion;
        const clip = await this.loadBundleAudio(bundleName, path);
        if (playVersion !== this.musicPlayVersion) {
            return;
        }

        // Logger.log(`[AudioService] 播放音乐: ${path.substring(path.lastIndexOf('/') + 1)}`);
        const playbackVolume = this.getMusicPlaybackVolume(volume);
        this.nativeAudio.setSource(MUSIC_CHANNEL, clip, { loop, volume: playbackVolume });
        this.nativeAudio.play(MUSIC_CHANNEL, { loop, volume: playbackVolume, restart: true });
    }

    /** 停止当前背景音乐，并取消尚未完成的异步音乐播放请求。 */
    public stopMusic(): void {
        // Logger.log('[AudioService] 停止音乐');
        this.musicPlayVersion++;
        this.nativeAudio.stop(MUSIC_CHANNEL);
    }

    /** 直接播放已加载的 AudioClip 音效。 */
    public playSoundClip(
        clip: AudioClip,
        volume: number = 1,
        logName: string = clip.name,
        options: AudioSoundPlayOptions = {},
    ): void {
        // Logger.log(`[AudioService] 播放音效: ${logName.substring(logName.lastIndexOf('/') + 1)}`);
        this.nativeAudio.playOneShot(
            clip,
            this.getSoundPlaybackVolume(volume),
            "auto",
            options.uninterrupted === true,
        );
    }

    /** 设置指定音频类型的静音状态。 */
    public setMuted(type: AudioType, muted: boolean): void {
        if (type === "music") {
            this.musicMuted = muted;
            this.nativeAudio.setVolume(MUSIC_CHANNEL, this.getMusicPlaybackVolume(1));
            return;
        }

        this.soundMuted = muted;
        this.nativeAudio.setVolume(SOUND_CHANNEL, this.getSoundPlaybackVolume(1));
    }

    /** 查询指定音频类型是否静音。 */
    public isMuted(type: AudioType): boolean {
        return type === "music" ? this.musicMuted : this.soundMuted;
    }

    /** 设置指定音频类型的运行时音量。 */
    public setVolume(type: AudioType, volume: number): void {
        const normalizedVolume = this.normalizeVolume(volume);
        if (type === "music") {
            this.musicVolume = normalizedVolume;
            this.nativeAudio.setVolume(MUSIC_CHANNEL, this.getMusicPlaybackVolume(1));
            return;
        }

        this.soundVolume = normalizedVolume;
        this.nativeAudio.setVolume(SOUND_CHANNEL, this.getSoundPlaybackVolume(1));
    }

    /** 获取指定音频类型的运行时音量。 */
    public getVolume(type: AudioType): number {
        return type === "music" ? this.musicVolume : this.soundVolume;
    }

    /** 加载并缓存 resources 目录下的音频。 */
    private async loadResourceAudio(path: string): Promise<AudioClip> {
        const cached = this.resourceAudioClips.get(path);
        if (cached?.isValid) return cached;

        const pending = this.resourceAudioLoading.get(path);
        if (pending) return pending;

        const loading = this.res.loadResources<AudioClip>(path, AudioClip).then((clip) => {
            this.resourceAudioClips.set(path, clip);
            return clip;
        });
        this.resourceAudioLoading.set(path, loading);
        try {
            return await loading;
        } finally {
            this.resourceAudioLoading.delete(path);
        }
    }

    /** 加载并缓存指定 Bundle 内的音频。 */
    private async loadBundleAudio(bundleName: string, path: string): Promise<AudioClip> {
        const key = `${bundleName}/${path}`;
        const cached = this.bundleAudioClips.get(key);
        if (cached?.isValid) return cached;

        const pending = this.bundleAudioLoading.get(key);
        if (pending) return pending;

        const loading = (async () => {
            await this.res.ensureBundle(bundleName, { cacheable: true });
            const clip = await this.res.loadFromBundle<AudioClip>(bundleName, path, AudioClip);
            this.bundleAudioClips.set(key, clip);
            return clip;
        })();
        this.bundleAudioLoading.set(key, loading);
        try {
            return await loading;
        } finally {
            this.bundleAudioLoading.delete(key);
        }
    }

    /** 播放 UIButton 指定的音效，未指定时使用项目注入的默认音效。 */
    private playButtonSound(clip: AudioClip | null): void {
        if (clip?.isValid) {
            this.playSoundClip(clip);
            return;
        }

        if (this.defaultClickSound) {
            void this.playResourceSound(this.defaultClickSound).catch((error) => {
                Logger.warn(`[AudioService] 播放默认点击音效失败: ${this.defaultClickSound}`, error);
            });
        }
    }

    private getMusicPlaybackVolume(volume: number): number {
        return this.musicMuted ? 0 : this.normalizeVolume(volume) * this.musicVolume;
    }

    private getSoundPlaybackVolume(volume: number): number {
        return this.soundMuted ? 0 : this.normalizeVolume(volume) * this.soundVolume;
    }

    private normalizeVolume(volume: number): number {
        return Math.max(0, Math.min(1, Number(volume) || 0));
    }
}
