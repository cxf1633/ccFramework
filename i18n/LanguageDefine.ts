/** 内嵌网页 language 参数的取值。 */
export type WebLanguage = 'zh' | 'en';

export default class LanguageDefine {
    public static enus = "en-us";
    public static hiin = "hi-in";
    public static thth = "th-th";
    public static zhcn = "zh-cn";
    public static zhhk = "zh-hk";
    public static vivn = "vi-vn";
    public static idid = "id-id";
    public static intelugu = "in-telugu";
    public static inmarathi = "in-marathi";
    public static ptpt = "pt-pt";
    public static eses = "es-es";
    public static frfr = "fr-fr";
    public static bnbd = "bn-bd";
    public static koko = "ko-ko";
    public static trtr = "tr-tr";

    /** 把语言代码（zh-cn / en-us 等）映射为内嵌网页的 language 参数；未匹配时回退 zh。 */
    public static getWebLanguage(language: string): WebLanguage {
        return language?.indexOf('en') === 0 ? 'en' : 'zh';
    }
}
