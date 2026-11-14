import { LanguageData } from "../i18n/LanguageData";

/**
 * 数量文本格式化参数。
 */
export interface QuantityFormatOptions {
    /** 小数位数。默认值由具体格式化 API 决定；formatQuantityText 与 formatChipText 当前都为 2。 */
    decimalPlaces?: number;
    /** 取整模式，默认四舍五入；floor 表示按显示精度向下截断。 */
    roundingMode?: "round" | "floor";
    /** 是否使用欧标小数分隔符，true 时用逗号作为小数点，例如 1,25K。 */
    european?: boolean;
    /** 是否移除末尾无意义的 0，例如 1.00K -> 1K。 */
    trimTrailingZeros?: boolean;
}

/** 新增接口 `formatLocalizedChipText` 的参数；旧方法不使用它。 */
export interface LocalizedQuantityFormatOptions extends QuantityFormatOptions {
    /** 覆盖当前语言（仅用于测试 / 特殊场景）；不传时读取 LanguageData.current。 */
    language?: string;
}

interface QuantityUnit {
    value: number;
    suffix: string;
}

/**
 * 筹码显示模式，`formatChipTextByMode` 用来选模式。
 *
 * - `"compact"`：缩写模式，等同于老的 `formatChipText`，例如 1500 -> "1.5K"；
 * - `"raw"`：原始模式，直接输出原数值，不带单位、不缩写、不按小数位取整，例如 1500 -> "1500"。
 */
export type ChipTextMode = "compact" | "raw";

/**
 * 数量格式化工具。
 *
 * 常用写法：
 * ```ts
 * NumberFormatUtils.formatChipText(50.56); // "50.56"
 * NumberFormatUtils.formatChipText(1500); // "1.5K"
 * NumberFormatUtils.formatChipText(1500, { trimTrailingZeros: false }); // "1.50K"
 * NumberFormatUtils.formatChipText(1500, { decimalPlaces: 2, european: true }); // "1,50K"
 * NumberFormatUtils.formatChipText(2_500_000); // "2.5M"
 * NumberFormatUtils.formatChipText(499_997_350); // "499.99M"
 * ```
 *
 * 需要直接显示原数值（不缩写）时用新接口，`formatChipText` 的老行为不受影响：
 * ```ts
 * NumberFormatUtils.formatChipTextByMode(1500, "raw"); // "1500"
 * NumberFormatUtils.formatChipTextByMode(1500, "compact"); // "1.5K"
 * NumberFormatUtils.formatChipRawText(1500); // "1500"
 * ```
 */
export class NumberFormatUtils {
    private static readonly CHIP_UNITS: readonly QuantityUnit[] = [
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "K" },
    ];

    /**
     * 格式化游戏内筹码数量。
     *
     * 规则：
     * - >= 1,000 使用 K；
     * - >= 1,000,000 使用 M；
     * - >= 1,000,000,000 使用 B；
     * - 默认最多保留 2 位小数，并移除末尾无意义的 0；
     * - 默认向下截断，避免 499.99M 显示成 500M；
     * - 小于 1,000 时不加单位，但仍按 decimalPlaces 格式化。
     */
    public static formatChipText(
        value: number,
        options: QuantityFormatOptions = { decimalPlaces: 2, trimTrailingZeros: true },
    ): string {
        return this.formatQuantityText(value, this.CHIP_UNITS, {
            ...options,
            decimalPlaces: options.decimalPlaces ?? 2,
            roundingMode: options.roundingMode ?? "floor",
            trimTrailingZeros: options.trimTrailingZeros ?? true,
        });
    }

    /**
     * 按显示模式格式化筹码数量（新接口，不影响 `formatChipText` 的老行为）。
     *
     * 老项目 / 需要 1.5K 这类缩写的调用继续用 `formatChipText`；
     * 需要直接显示原数值的调用传 `"raw"`（等价于 `formatChipRawText`）。
     *
     * @param value 服务端下发的原始筹码数值。
     * @param mode 显示模式，见 `ChipTextMode`。
     * @param options 格式化参数，只在 `"compact"` 模式下生效。
     */
    public static formatChipTextByMode(
        value: number,
        mode: ChipTextMode,
        options: QuantityFormatOptions = {},
    ): string {
        return mode === "raw"
            ? this.formatChipRawText(value, options)
            : this.formatChipText(value, options);
    }

    /**
     * 原始模式：直接输出原数值。
     *
     * - 整数不带小数点（1500 -> "1500"），小数原样保留（50.56 -> "50.56"）；
     * - 不套 K/M/B 单位、不按 decimalPlaces 取整、不做千分位分组；
     * - 负值统一按 0 显示，与 `formatChipText` 保持一致；
     * - `european` 仍然生效（1500.5 -> "1500,5"）。
     *
     * @param value 服务端下发的原始筹码数值。
     * @param options 格式化参数，只有 `european` 影响输出。
     */
    public static formatChipRawText(
        value: number,
        options: QuantityFormatOptions = {},
    ): string {
        const amount = Math.max(0, Number(value) || 0);
        // `Number(value) || 0` 已经兜住了 NaN，这里再兜一次 Infinity，避免显示 "Infinity"
        if (!Number.isFinite(amount)) {
            return "0";
        }

        const text = `${amount}`;
        return options.european ? text.replace(".", ",") : text;
    }

    /**
     * 按指定单位表格式化数量。
     *
     * @param value 原始数量。
     * @param units 单位表，按从大到小传入，例如 B/M/K。
     * @param options 格式化参数。
     */
    public static formatQuantityText(
        value: number,
        units: readonly QuantityUnit[] = NumberFormatUtils.CHIP_UNITS,
        options: QuantityFormatOptions = {},
    ): string {
        const amount = Math.max(0, Number(value) || 0);
        const decimalPlaces = Math.max(0, options.decimalPlaces ?? 2);
        const unit = units.find((item) => amount >= item.value);

        if (!unit) {
            return this.formatDecimal(amount, decimalPlaces, options);
        }

        const scaledAmount = amount / unit.value;
        return `${this.formatDecimal(scaledAmount, decimalPlaces, options)}${unit.suffix}`;
    }

    /**
     * 以千分位逗号格式化数字（不带 K/M/B 后缀），例如 100000 -> "100,000"，7200000 -> "7,200,000"。
     * 仅对整数部分做千分位分组，小数位原样保留。与本地环境无关，始终使用英文逗号分组。
     *
     * @param value 原始数字。
     */
    public static formatWithThousands(value: number): string {
        const num = Number(value) || 0;
        const negative = num < 0;
        const abs = Math.abs(num);
        const [intPart, decPart] = abs.toString().split(".");
        const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        const text = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
        return negative ? `-${text}` : text;
    }
    /**
     * 仅保留字符串的整数部分，去掉小数点及其后的内容。
     * 例如 "6.00" -> "6"，"1545.00" -> "1545"，"6" -> "6"。
     * 若传入空字符串、null 或 undefined，直接返回空字符串，避免报错。
     *
     * @param value 带或不带小数的字符串。
     */
    public static getIntegerPart(value: string | null | undefined): string {
        if (!value) {
            return "";
        }
        return value.split(".")[0] ?? "";
    }
    private static formatDecimal(value: number, decimalPlaces: number, options: QuantityFormatOptions): string {
        const factor = Math.pow(10, decimalPlaces);
        // floor 前加 1e-6 修正浮点误差：十进制小数（如 19.9）或缩写除法（如 97000/10000）的
        // 结果在二进制下会略小于真实值（9.6999999..），直接 floor 会丢一位（9.69 而非 9.7）。
        const displayValue = options.roundingMode === "floor"
            ? Math.floor(value * factor + 1e-6) / factor
            : value;
        let text = displayValue.toFixed(decimalPlaces);
        if (options.trimTrailingZeros) {
            text = text.replace(/\.?0+$/, "");
        }

        return options.european ? text.replace(".", ",") : text;
    }

    

    // 1、9。英文: 9 。中文：9
    // 2、99。英文: 99 。中文：99
    // 3、999。英文: 999 。中文：999
    // 4、9999。英文: 9999 。中文：9999
    // 5、99999。英文: 99999 。中文：99999
    // 6、999999。英文: 999.99K。中文：99.99万
    // 7、9999999。英文: 9999K 。中文：999.9万
    // 8、99999999。英文: 99.99M 。中文：9999万
    // 9、999999999。英文: 999.9M 。中文：9.999亿
    // 10、9999999999。英文: 9999M 。中文：99.99亿
    // 11、99999999999。英文: 99.9B 。中文：999.9亿
    // 12、999999999999。英文: 999.9B 。中文：9999亿
    // 13、9999999999999。英文: 9999B 。中文：9.999万亿

    /////////////////////////////////////////////////////////////////////////////////////////
    // 以下为新增的「本地化数量格式化」接口，独立于上方所有旧方法。
    // 需要「按当前语言切换单位 + 固定 5 位」的项目请改用 formatLocalizedChipText。
    /////////////////////////////////////////////////////////////////////////////////////////

    /** 数字部分（含小数点）最多 5 个字符 → 整数位 + 小数位最多 4 位。 */
    private static readonly LOCALIZED_MAX_DIGITS = 4;
    /** 原数值最多 5 位整数，超过才启用单位。 */
    private static readonly LOCALIZED_RAW_LIMIT = 100_000;
    /** 带单位时缩放后整数位最多 4 位，超过就换更大的单位。 */
    private static readonly LOCALIZED_SCALED_LIMIT = 10_000;

    /** 英文单位表：K / M / B / T。 */
    private static readonly LOCALIZED_EN_UNITS: readonly QuantityUnit[] = [
        { value: 1_000, suffix: "K" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000_000_000, suffix: "T" },
    ];

    /** 中文单位表：万 / 亿 / 万亿（只使用「万」「亿」两个字）。 */
    private static readonly LOCALIZED_ZH_UNITS: readonly QuantityUnit[] = [
        { value: 10_000, suffix: "万" },
        { value: 100_000_000, suffix: "亿" },
        { value: 1_000_000_000_000, suffix: "万亿" },
    ];

    /**
     * 按当前语言格式化数量：中文 万/亿/万亿，其它语言 K/M/B/T。
     *
     * 规则：
     * - 数字部分（含小数点）最多 5 个字符，即「整数位 + 小数位」最多 4 位；整数位少就用小数补齐；
     * - 数值能被当前精度精确表示时，裁掉补出来的 0、不出现小数点（990000 -> "99万"）；
     *   有非零尾数被截掉时必须保留完整小数位（999001 -> "99.90万"）；
     * - 原数值最多 5 位整数，超过才启用单位；单位取「缩放后整数位不超过 4 位」的最小单位；
     * - 默认向下截断；`decimalPlaces` 显式传入时改为固定小数位。
     *
     * 中文（zh-cn）示例：
     * ```ts
     * NumberFormatUtils.formatLocalizedChipText(99999);         // "99999"
     * NumberFormatUtils.formatLocalizedChipText(990000);        // "99万"
     * NumberFormatUtils.formatLocalizedChipText(999000);        // "99.9万"
     * NumberFormatUtils.formatLocalizedChipText(999001);        // "99.90万"
     * NumberFormatUtils.formatLocalizedChipText(999999);        // "99.99万"
     * NumberFormatUtils.formatLocalizedChipText(9999999);       // "999.9万"
     * NumberFormatUtils.formatLocalizedChipText(99999999);      // "9999万"
     * NumberFormatUtils.formatLocalizedChipText(999999999);     // "9.999亿"
     * NumberFormatUtils.formatLocalizedChipText(9999999999999); // "9.999万亿"
     * ```
     * 英文（en-us）示例：990000 -> "990K"、999000 -> "999K"、999001 -> "999.0K"、
     * 999999 -> "999.9K"、99999999 -> "99.99M"、9999999999999 -> "9999B"。
     *
     * @param value 原始数量；负数 / NaN / Infinity 按 0 处理。
     * @param options 格式化参数；`language` 可覆盖当前语言（默认读 LanguageData.current）。
     */
    public static formatLocalizedChipText(
        value: number,
        options: LocalizedQuantityFormatOptions = {},
    ): string {
        const amount = Math.max(0, Number(value) || 0);
        if (!Number.isFinite(amount)) {
            return "0";
        }

        const language = (options.language ?? LanguageData.current ?? "").toLowerCase();
        const units = language.startsWith("zh")
            ? NumberFormatUtils.LOCALIZED_ZH_UNITS
            : NumberFormatUtils.LOCALIZED_EN_UNITS;

        /** 动态小数位：整数位 + 小数位最多 4 位，保证数字部分（含小数点）不超过 5 个字符 */
        const decimalPlacesFor = (scaled: number): number => {
            if (options.decimalPlaces !== undefined) {
                return Math.max(0, options.decimalPlaces);
            }
            const integerDigits = Math.max(1, Math.floor(scaled).toString().length);
            return Math.max(0, NumberFormatUtils.LOCALIZED_MAX_DIGITS - integerDigits);
        };
        const render = (scaled: number, suffix: string): string =>
            `${NumberFormatUtils.formatLocalizedDecimal(scaled, decimalPlacesFor(scaled), options)}${suffix}`;

        // 原数值最多 5 位整数，不套单位
        if (amount < NumberFormatUtils.LOCALIZED_RAW_LIMIT) {
            return render(amount, "");
        }

        // 取缩放后整数位不超过 4 位的最小单位；超出最大单位时退化为最大单位
        const sorted = [...units].sort((a, b) => a.value - b.value);
        const unit = sorted.find((item) => amount / item.value < NumberFormatUtils.LOCALIZED_SCALED_LIMIT)
            ?? sorted[sorted.length - 1];
        if (!unit) {
            return NumberFormatUtils.formatLocalizedDecimal(amount, 0, options);
        }
        return render(amount / unit.value, unit.suffix);
    }

    /** 新增接口专用的小数格式化；不复用旧 `formatDecimal`，避免影响旧方法行为。 */
    private static formatLocalizedDecimal(
        value: number,
        decimalPlaces: number,
        options: LocalizedQuantityFormatOptions,
    ): string {
        const factor = Math.pow(10, decimalPlaces);
        const product = value * factor;
        // 相对精度补偿二进制浮点尾巴（如 9.699999999999999）；
        // 用相对量而非固定大 epsilon，避免把「真实就差 1e-9」的值推过整数边界。
        const epsilon = Number.EPSILON * Math.abs(product) * 4;
        const isFloor = options.roundingMode !== "round";
        const floored = Math.floor(product + epsilon);
        // 缩放后是否有非零尾数被截掉：999001/1e4 = 99.9001 截成 99.90 时，
        // 末尾的 0 是「有效精度位」必须保留；990000/1e4 = 99 精确值时才裁掉补出来的 0。
        const hasTruncatedTail = isFloor && product - floored > 1e-6;
        const displayValue = isFloor ? floored / factor : value;
        let text = displayValue.toFixed(decimalPlaces);
        if (options.trimTrailingZeros !== false && !hasTruncatedTail && text.indexOf(".") >= 0) {
            // 只裁剪小数部分末尾的 0；没有小数点时不处理，否则 "10000" 会被裁成 "1"
            text = text.replace(/0+$/, "").replace(/\.$/, "");
        }
        return options.european ? text.replace(".", ",") : text;
    }
}
