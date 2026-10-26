/** 通用筹码面值，按从大到小排列；图片资源由各游戏自行映射。 */
export const CHIP_DENOMINATIONS = [
    5000000000, 2000000000, 1000000000,
    500000000, 200000000, 100000000,
    50000000, 20000000, 10000000,
    5000000, 2000000, 1000000,
    500000, 200000, 100000,
    50000, 20000, 10000,
    5000, 2000, 1000,
    500, 200, 100,
    50, 20, 10,
    5, 2, 1,
] as const;

/** 只计算展示面值，不加载图片、不依赖游戏节点。 */
export class ChipUtils {
    /**
     * 金额按大面值优先拆分，超过数量上限则逐步按十进制四舍五入。
     * 返回值用于近似展示，不能用于结算；原金额文字应独立显示。
     * 金额最高按 50 亿处理，默认最多六枚。
     */
    public static getApproximateChipValues(amount: number, maxCount: number = 6): number[] {
        if (!Number.isFinite(amount)) return [];
        if (!Number.isInteger(maxCount) || maxCount < 1) return [];
        const normalizedAmount = Math.min(CHIP_DENOMINATIONS[0], Math.max(0, Math.round(amount)));
        if (normalizedAmount <= 0) return [];

        for (let roundUnit = 1; roundUnit <= 1000000000; roundUnit *= 10) {
            const roundedAmount = Math.round(normalizedAmount / roundUnit) * roundUnit;
            const values = this.splitChipValues(roundedAmount);
            if (values.length <= maxCount) return values;
        }
        return [CHIP_DENOMINATIONS[0]];
    }

    /** 按大面值优先精确拆分整数金额。 */
    public static splitChipValues(amount: number): number[] {
        if (!Number.isSafeInteger(amount) || amount <= 0) return [];
        const values: number[] = [];
        let remaining = amount;
        for (const denomination of CHIP_DENOMINATIONS) {
            while (remaining >= denomination) {
                values.push(denomination);
                remaining -= denomination;
            }
        }
        return values;
    }
}
