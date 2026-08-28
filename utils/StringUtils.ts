/**
 * 字符串工具。
 *
 * 集中处理与语言相关的展示文本：目前提供阿拉伯数字转中文数字，供签到天数、
 * 章节序号等需要"第几天/第几关"样式文案的场景使用。
 *
 * 常用写法：
 * ```ts
 * StringUtils.toChineseNumeral(3);    // "三"
 * StringUtils.toChineseNumeral(10);   // "十"
 * StringUtils.toChineseNumeral(105);  // "一百零五"
 * StringUtils.toChineseNumeral(-1);   // "-1"（超出支持范围时原样返回数字字符串）
 * ```
 */
export class StringUtils {
    private static readonly CHINESE_DIGITS: readonly string[] = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

    /**
     * 把非负整数转换为中文数字，支持 0 ~ 9999。
     *
     * 规则：
     * - 个位直接映射"零"~"九"；
     * - 十位仅在 >= 2 时写出数字，例如 10 -> "十"、20 -> "二十"；
     * - 中间位为零且后位还有数字时补"零"，例如 105 -> "一百零五"、1010 -> "一千零一十"；
     * - 非整数、负数或超出 9999 时不转换，原样返回 String(value)。
     */
    public static toChineseNumeral(value: number): string {
        if (!Number.isInteger(value) || value < 0 || value > 9999) {
            return String(value);
        }
        if (value < 10) {
            return this.digitToChinese(value);
        }

        const thousands = Math.floor(value / 1000);
        const hundreds = Math.floor(value / 100) % 10;
        const tens = Math.floor(value / 10) % 10;
        const ones = value % 10;

        let result = "";
        if (thousands > 0) {
            result += this.digitToChinese(thousands) + "千";
        }
        if (hundreds > 0) {
            result += this.digitToChinese(hundreds) + "百";
        } else if (thousands > 0 && (tens > 0 || ones > 0)) {
            result += "零";
        }
        if (tens > 0) {
            // 十位的 1 只有在没有更高位时才省略（10 -> "十"），有百/千位时须写出（110 -> "一百一十"）。
            if (tens > 1 || thousands > 0 || hundreds > 0) {
                result += this.digitToChinese(tens);
            }
            result += "十";
        } else if (hundreds > 0 && ones > 0) {
            result += "零";
        }
        if (ones > 0) {
            result += this.digitToChinese(ones);
        }
        return result;
    }

    private static digitToChinese(digit: number): string {
        return this.CHINESE_DIGITS[digit] ?? String(digit);
    }
}
