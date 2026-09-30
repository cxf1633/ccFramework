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

interface QuantityUnit {
    value: number;
    suffix: string;
}

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
}
