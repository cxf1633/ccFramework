import { director } from "cc";
import { ResManager } from "../res/ResManager";

export class SceneManager {
    public constructor(private readonly res: ResManager) { }

    public getCurrentSceneName(): string {
        return director.getScene()?.name || "";
    }

    public loadScene(sceneName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            director.loadScene(sceneName, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve();
            });
        });
    }

    // public async loadBundleScene(bundleName: string, sceneName: string, options?: Record<string, any>): Promise<void> {
    //     await this.res.ensureBundle(bundleName, options);
    //     await this.loadScene(sceneName);
    // }

    public async preloadScene(bundleName: string, sceneName: string, options?: Record<string, any>): Promise<void> {
        const bundle = await this.res.ensureBundle(bundleName, options);

        return new Promise((resolve, reject) => {
            bundle.preloadScene(sceneName, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve();
            });
        });
    }

}
