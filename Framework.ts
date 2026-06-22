import { EventManager } from "./event/EventManager";
import { message } from "./event/MessageManager";
import { HttpManager } from "./http/HttpManager";
import { LanguageManager } from "./language/Language";
import { ResManager } from "./res/ResManager";
import { SceneManager } from "./scene/SceneManager";
import { StorageManager } from "./storage/StorageManager";
import { UIManager } from "./ui/UIManager";
import { AesUtils } from "./utils/AesUtils";
import { ZlibUtils } from "./utils/ZlibUtils";

const resourcesMgr = new ResManager();

export class Framework {
    public static readonly ResourcesMgr = resourcesMgr;
    public static readonly SceneMgr = new SceneManager(resourcesMgr);
    public static readonly UIMgr = new UIManager(resourcesMgr);

    public static readonly EventManager = EventManager;
    public static readonly MessageManager = message;
    public static readonly HttpManager = HttpManager;
    public static readonly LanguageMgr = LanguageManager.getInstance();
    public static readonly StorageMgr = StorageManager;
    public static readonly AesUtils = AesUtils;
    public static readonly ZlibUtils = ZlibUtils;
}
