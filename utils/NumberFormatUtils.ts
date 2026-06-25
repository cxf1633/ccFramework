/**
 * 数量文本格式化参数。
 */
export interface QuantityFormatOptions {
    /** 小数位数，默认 2。 */
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
 * NumberFormatUtils.formatChipText(50.56); // "50"
 * NumberFormatUtils.formatChipText(1500); // "1K"
 * NumberFormatUtils.formatChipText(1500, { decimalPlaces: 2 }); // "1.50K"
 * NumberFormatUtils.formatChipText(1500, { decimalPlaces: 2, trimTrailingZeros: true }); // "1.5K"
 * NumberFormatUtils.formatChipText(1500, { decimalPlaces: 2, european: true }); // "1,50K"
 * NumberFormatUtils.formatChipText(2_500_000); // "2M"
 * NumberFormatUtils.formatChipText(499_997_350); // "499M"
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
     * - 默认不保留小数；
     * - 默认向下截断，避免 499.99M 显示成 500M；
     * - 小于 1,000 时不加单位，但仍按 decimalPlaces 格式化。
     */
    public static formatChipText(value: number, options: QuantityFormatOptions = {}): string {
        return this.formatQuantityText(value, this.CHIP_UNITS, {
            ...options,
            decimalPlaces: options.decimalPlaces ?? 0,
            roundingMode: options.roundingMode ?? "floor",
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

    private static formatDecimal(value: number, decimalPlaces: number, options: QuantityFormatOptions): string {
        const displayValue = options.roundingMode === "floor"
            ? Math.floor(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces)
            : value;
        let text = displayValue.toFixed(decimalPlaces);
        if (options.trimTrailingZeros) {
            text = text.replace(/\.?0+$/, "");
        }

        return options.european ? text.replace(".", ",") : text;
    }
}
