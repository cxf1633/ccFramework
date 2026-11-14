/**
 * 本地二维码生成器（QRCodeGenerator）
 *
 * 纯 TypeScript 实现，不依赖网络、不需要 npm 包，浏览器预览 / 原生 / 小游戏都能跑。
 * 生成结果是模块矩阵（黑白格子），由调用方自行画到 Texture2D 或 Graphics 上。
 *
 * 能力范围：
 * - 编码：Byte 模式（内容按 UTF-8 处理，URL / 中文都能编）；
 * - 纠错等级：L / M / Q / H（默认 M，容错约 15%）；
 * - 版本：1 ~ 10（最长约 271 字节，L 级 v10）；
 * - 掩码：8 种全试一遍，按标准惩罚分选最优，扫码识别率与在线服务一致。
 *
 * 用法：
 * ```ts
 * const qr = QRCodeGenerator.generate('https://www.yatelan.com/invite?clubId=123', 'M');
 * if (qr) {
 *     // qr.size：模块边长；qr.modules[row][col]：true = 黑模块
 * }
 * ```
 */

/** 二维码纠错等级：L≈7% / M≈15% / Q≈25% / H≈30% 的损坏容忍度 */
export type QRCodeEcLevel = 'L' | 'M' | 'Q' | 'H';

/** 二维码生成结果 */
export interface QRCodeMatrix {
    /** 版本号 1 ~ 10 */
    version: number;
    /** 模块边长（= 17 + 4 * version） */
    size: number;
    /** 实际使用的纠错等级 */
    ecLevel: QRCodeEcLevel;
    /** 模块矩阵，modules[row][col] 为 true 表示黑模块 */
    modules: boolean[][];
}

/** 支持的最大版本（v10 已足够放下普通邀请链接；再大要补版本信息位的其他表） */
const MAX_VERSION = 10;

/** 各版本总码字数（数据码字 + 纠错码字），下标为版本号 */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/** 每个纠错块的纠错码字数，[等级][版本] */
const EC_CODEWORDS_PER_BLOCK: Record<QRCodeEcLevel, number[]> = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

/** 纠错块个数，[等级][版本] */
const EC_BLOCK_COUNT: Record<QRCodeEcLevel, number[]> = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

/** 各版本对齐图形中心坐标（下标为版本号） */
const ALIGNMENT_POSITIONS: number[][] = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
];

/** 纠错等级在格式信息里的编码值 */
const EC_LEVEL_BITS: Record<QRCodeEcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** 数据区填满后的填充字节（0xEC / 0x11 交替） */
const PAD_BYTES = [0xec, 0x11];

// ---------------------------------------------------------------------------
// GF(256) 运算表（RS 纠错用，本原多项式 0x11D）
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField(): void {
    let value = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = value;
        GF_LOG[value] = i;
        value <<= 1;
        if (value & 0x100) {
            value ^= 0x11d;
        }
    }
    // 乘法时两个下标相加会超过 255，这里把指数表延长到 512
    for (let i = 255; i < 512; i++) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
})();

/** GF(256) 乘法 */
function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) {
        return 0;
    }
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * 把字符串转成 UTF-8 字节数组。
 *
 * 原生 / 小游戏不一定有 TextEncoder，所以手写转换；代理对（emoji 等）按 4 字节处理。
 */
function toUtf8Bytes(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i += 1;
            }
        }

        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

/**
 * 二维码生成器：静态类，直接 `QRCodeGenerator.generate(text)`。
 */
export class QRCodeGenerator {
    /** RS 生成多项式缓存，key 为纠错码字数 */
    private static readonly _rsDivisorCache = new Map<number, Uint8Array>();

    /**
     * 生成二维码矩阵。
     *
     * @param text 二维码内容（按 UTF-8 编码）
     * @param ecLevel 纠错等级，默认 M
     * @returns 矩阵；内容为空或超出支持范围时返回 null
     */
    public static generate(text: string, ecLevel: QRCodeEcLevel = 'M'): QRCodeMatrix | null {
        const content = `${text ?? ''}`;
        if (content.length <= 0) {
            return null;
        }

        // 防呆：传了不认识的等级就退回默认 M
        const level: QRCodeEcLevel = EC_CODEWORDS_PER_BLOCK[ecLevel] ? ecLevel : 'M';
        const dataBytes = toUtf8Bytes(content);
        const version = this._pickVersion(dataBytes.length, level);
        if (version <= 0) {
            return null;
        }

        const dataCodewords = this._buildDataCodewords(dataBytes, version, level);
        const allCodewords = this._buildAllCodewords(dataCodewords, version, level);
        return this._buildMatrix(allCodewords, version, level);
    }

    // -----------------------------------------------------------------------
    // 编码：版本选择、数据码字、纠错与交织
    // -----------------------------------------------------------------------

    /**
     * 选最小的可用版本。
     *
     * Byte 模式的数据段 = 4 位模式指示符 + 字符计数字段（v1~9 为 8 位，v10 起 16 位）+ 数据字节。
     */
    private static _pickVersion(byteLength: number, level: QRCodeEcLevel): number {
        for (let version = 1; version <= MAX_VERSION; version++) {
            const charCountBits = version <= 9 ? 8 : 16;
            if (byteLength >= (1 << charCountBits)) {
                continue;
            }

            const capacityBits = this._dataCodewordCount(version, level) * 8;
            if (4 + charCountBits + byteLength * 8 <= capacityBits) {
                return version;
            }
        }
        return 0;
    }

    /** 某版本 + 纠错等级下的数据码字总数（不含纠错码字） */
    private static _dataCodewordCount(version: number, level: QRCodeEcLevel): number {
        return TOTAL_CODEWORDS[version] - EC_CODEWORDS_PER_BLOCK[level][version] * EC_BLOCK_COUNT[level][version];
    }

    /**
     * 生成数据码字：模式指示符 + 字符计数 + 字节数据 + 终止符 + 填充。
     */
    private static _buildDataCodewords(dataBytes: number[], version: number, level: QRCodeEcLevel): Uint8Array {
        const capacityBits = this._dataCodewordCount(version, level) * 8;
        const charCountBits = version <= 9 ? 8 : 16;
        const bits: number[] = [];

        // 模式指示符 0100 = Byte 模式
        for (let i = 3; i >= 0; i--) {
            bits.push((0x4 >>> i) & 1);
        }
        // 字符计数
        for (let i = charCountBits - 1; i >= 0; i--) {
            bits.push((dataBytes.length >>> i) & 1);
        }
        // 数据字节
        for (let i = 0; i < dataBytes.length; i++) {
            for (let bit = 7; bit >= 0; bit--) {
                bits.push((dataBytes[i] >>> bit) & 1);
            }
        }

        // 终止符最多 4 个 0，之后补 0 到字节边界
        const terminator = Math.min(4, capacityBits - bits.length);
        for (let i = 0; i < terminator; i++) {
            bits.push(0);
        }
        while (bits.length % 8 !== 0) {
            bits.push(0);
        }

        const codewords: number[] = [];
        for (let i = 0; i < bits.length; i += 8) {
            let value = 0;
            for (let bit = 0; bit < 8; bit++) {
                value = (value << 1) | bits[i + bit];
            }
            codewords.push(value);
        }

        // 余下的数据区用 0xEC / 0x11 交替填满
        for (let i = 0; codewords.length < capacityBits / 8; i++) {
            codewords.push(PAD_BYTES[i % 2]);
        }

        return new Uint8Array(codewords);
    }

    /**
     * 分块计算纠错码字，并按标准顺序交织成最终码字序列。
     */
    private static _buildAllCodewords(data: Uint8Array, version: number, level: QRCodeEcLevel): Uint8Array {
        const ecPerBlock = EC_CODEWORDS_PER_BLOCK[level][version];
        const blockCount = EC_BLOCK_COUNT[level][version];
        const shortBlockLength = Math.floor(data.length / blockCount);
        const longBlockCount = data.length % blockCount;

        const dataBlocks: Uint8Array[] = [];
        const eccBlocks: Uint8Array[] = [];
        let offset = 0;
        for (let i = 0; i < blockCount; i++) {
            // 长块排在后面：前面 blockCount - longBlockCount 块是短块
            const length = shortBlockLength + (i >= blockCount - longBlockCount ? 1 : 0);
            const block = data.subarray(offset, offset + length);
            offset += length;
            dataBlocks.push(block);
            eccBlocks.push(this._calcEcc(block, ecPerBlock));
        }

        const result: number[] = [];
        const maxDataLength = shortBlockLength + (longBlockCount > 0 ? 1 : 0);
        // 数据码字按列交织
        for (let i = 0; i < maxDataLength; i++) {
            for (let b = 0; b < blockCount; b++) {
                if (i < dataBlocks[b].length) {
                    result.push(dataBlocks[b][i]);
                }
            }
        }
        // 纠错码字按列交织
        for (let i = 0; i < ecPerBlock; i++) {
            for (let b = 0; b < blockCount; b++) {
                result.push(eccBlocks[b][i]);
            }
        }

        return new Uint8Array(result);
    }

    /**
     * 计算一个数据块的纠错码字（多项式除法取余）。
     */
    private static _calcEcc(block: Uint8Array, degree: number): Uint8Array {
        const divisor = this._rsDivisor(degree);
        const ecc = new Uint8Array(degree);

        for (let i = 0; i < block.length; i++) {
            const factor = block[i] ^ ecc[0];
            // 余数左移一位，再按生成多项式修正
            ecc.copyWithin(0, 1);
            ecc[degree - 1] = 0;
            for (let j = 0; j < degree; j++) {
                ecc[j] ^= gfMul(divisor[j + 1], factor);
            }
        }

        return ecc;
    }

    /**
     * 取 RS 生成多项式（首项系数 1，降幂排列），结果按 degree 缓存。
     */
    private static _rsDivisor(degree: number): Uint8Array {
        const cached = QRCodeGenerator._rsDivisorCache.get(degree);
        if (cached) {
            return cached;
        }

        let divisor = new Uint8Array([1]);
        let root = 1;
        for (let i = 0; i < degree; i++) {
            // 乘以 (x + root)
            const next = new Uint8Array(divisor.length + 1);
            for (let j = 0; j < divisor.length; j++) {
                next[j] ^= divisor[j];
                next[j + 1] ^= gfMul(divisor[j], root);
            }
            divisor = next;
            root = gfMul(root, 0x02);
        }

        QRCodeGenerator._rsDivisorCache.set(degree, divisor);
        return divisor;
    }

    // -----------------------------------------------------------------------
    // 矩阵：功能图形、数据落位、掩码、格式信息
    // -----------------------------------------------------------------------

    /**
     * 把码字铺成模块矩阵：画功能图形 → 填数据 → 8 种掩码择优。
     */
    private static _buildMatrix(codewords: Uint8Array, version: number, level: QRCodeEcLevel): QRCodeMatrix {
        const size = version * 4 + 17;
        const modules: boolean[][] = [];
        const isFunction: boolean[][] = [];
        for (let y = 0; y < size; y++) {
            modules.push(new Array<boolean>(size).fill(false));
            isFunction.push(new Array<boolean>(size).fill(false));
        }

        const setFunction = (x: number, y: number, dark: boolean): void => {
            if (x < 0 || x >= size || y < 0 || y >= size) {
                return;
            }
            modules[y][x] = dark;
            isFunction[y][x] = true;
        };

        // 1) 定时图形（第 6 行 / 第 6 列，黑白交替）。先画它，后面定位 / 对齐图形会覆盖掉重叠部分
        for (let i = 0; i < size; i++) {
            setFunction(6, i, i % 2 === 0);
            setFunction(i, 6, i % 2 === 0);
        }

        // 2) 定位图形（三个角，7x7 黑盒 + 外侧白色分隔区）
        const drawFinder = (centerX: number, centerY: number): void => {
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const distance = Math.max(Math.abs(dx), Math.abs(dy));
                    // 距离 2 / 4 是白圈，其余是黑圈
                    setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
                }
            }
        };
        drawFinder(3, 3);
        drawFinder(size - 4, 3);
        drawFinder(3, size - 4);

        // 3) 对齐图形（与三个定位图形重叠时跳过）
        const alignment = ALIGNMENT_POSITIONS[version] ?? [];
        for (let i = 0; i < alignment.length; i++) {
            for (let j = 0; j < alignment.length; j++) {
                const isCorner = (i === 0 && j === 0)
                    || (i === 0 && j === alignment.length - 1)
                    || (i === alignment.length - 1 && j === 0);
                if (isCorner) {
                    continue;
                }
                const centerX = alignment[j];
                const centerY = alignment[i];
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        // 中心黑、外圈黑，中间一圈白
                        setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                }
            }
        }

        // 4) 先按掩码 0 占位格式信息（顺带把位置标记为功能模块），等掩码选定后覆盖
        this._drawFormatBits(modules, isFunction, size, level, 0);

        // 5) v7 起还有 18 位版本信息，两处各写一份
        if (version >= 7) {
            let rem = version;
            for (let i = 0; i < 12; i++) {
                rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
            }
            const versionBits = (version << 12) | rem;
            for (let i = 0; i < 18; i++) {
                const dark = ((versionBits >>> i) & 1) !== 0;
                const a = size - 11 + (i % 3);
                const b = Math.floor(i / 3);
                setFunction(a, b, dark);
                setFunction(b, a, dark);
            }
        }

        // 6) 数据码字从右下角开始，两列一组蛇形向上 / 向下填充，跳过功能模块与第 6 列
        let bitIndex = 0;
        const totalBits = codewords.length * 8;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) {
                right = 5;
            }
            for (let vertical = 0; vertical < size; vertical++) {
                for (let offset = 0; offset < 2; offset++) {
                    const x = right - offset;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vertical : vertical;
                    if (!isFunction[y][x] && bitIndex < totalBits) {
                        modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
                        bitIndex += 1;
                    }
                }
            }
        }

        // 7) 8 种掩码各生成一份候选，按标准惩罚分挑最不容易误识别的
        let bestMask = 0;
        let bestPenalty = Number.MAX_SAFE_INTEGER;
        let bestModules = modules;
        for (let mask = 0; mask < 8; mask++) {
            const candidate = modules.map((row) => row.slice());
            this._applyMask(candidate, isFunction, mask, size);
            this._drawFormatBits(candidate, null, size, level, mask);
            const penalty = this._calcPenalty(candidate, size);
            if (penalty < bestPenalty) {
                bestPenalty = penalty;
                bestMask = mask;
                bestModules = candidate;
            }
        }

        return { version, size, ecLevel: level, modules: bestModules };
    }

    /**
     * 写格式信息（纠错等级 + 掩码），共 15 位，两处副本。
     *
     * @param isFunction 传数组时表示这次是占位、需要把位置标记成功能模块；传 null 表示只覆盖值
     */
    private static _drawFormatBits(
        modules: boolean[][],
        isFunction: boolean[][] | null,
        size: number,
        level: QRCodeEcLevel,
        mask: number,
    ): void {
        const data = (EC_LEVEL_BITS[level] << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) {
            rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        }
        const bits = ((data << 10) | rem) ^ 0x5412;
        const getBit = (index: number): boolean => ((bits >>> index) & 1) !== 0;
        const set = (x: number, y: number, dark: boolean): void => {
            modules[y][x] = dark;
            if (isFunction) {
                isFunction[y][x] = true;
            }
        };

        // 第一份：环绕左上定位图形
        for (let i = 0; i <= 5; i++) {
            set(8, i, getBit(i));
        }
        set(8, 7, getBit(6));
        set(8, 8, getBit(7));
        set(7, 8, getBit(8));
        for (let i = 9; i < 15; i++) {
            set(14 - i, 8, getBit(i));
        }

        // 第二份：贴右上 / 左下定位图形
        for (let i = 0; i < 8; i++) {
            set(size - 1 - i, 8, getBit(i));
        }
        for (let i = 8; i < 15; i++) {
            set(8, size - 15 + i, getBit(i));
        }
        // 固定黑模块
        set(8, size - 8, true);
    }

    /**
     * 按掩码翻转非功能模块（只翻转候选副本）。
     */
    private static _applyMask(modules: boolean[][], isFunction: boolean[][], mask: number, size: number): void {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (isFunction[y][x]) {
                    continue;
                }
                if (this._isMasked(mask, x, y)) {
                    modules[y][x] = !modules[y][x];
                }
            }
        }
    }

    /** 第 mask 号掩码的翻转条件 */
    private static _isMasked(mask: number, x: number, y: number): boolean {
        switch (mask) {
            case 0: return (x + y) % 2 === 0;
            case 1: return y % 2 === 0;
            case 2: return x % 3 === 0;
            case 3: return (x + y) % 3 === 0;
            case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            case 5: return (x * y) % 2 + (x * y) % 3 === 0;
            case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
            case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            default: return false;
        }
    }

    /**
     * 计算掩码惩罚分（标准 4 条规则，分越低越好）。
     */
    private static _calcPenalty(modules: boolean[][], size: number): number {
        let penalty = 0;

        // 规则 1：同色连续 5 个及以上，3 + (长度 - 5)
        for (let y = 0; y < size; y++) {
            let run = 1;
            for (let x = 1; x < size; x++) {
                if (modules[y][x] === modules[y][x - 1]) {
                    run += 1;
                } else {
                    if (run >= 5) {
                        penalty += 3 + (run - 5);
                    }
                    run = 1;
                }
            }
            if (run >= 5) {
                penalty += 3 + (run - 5);
            }
        }
        for (let x = 0; x < size; x++) {
            let run = 1;
            for (let y = 1; y < size; y++) {
                if (modules[y][x] === modules[y - 1][x]) {
                    run += 1;
                } else {
                    if (run >= 5) {
                        penalty += 3 + (run - 5);
                    }
                    run = 1;
                }
            }
            if (run >= 5) {
                penalty += 3 + (run - 5);
            }
        }

        // 规则 2：2x2 同色方块，每块 3 分
        for (let y = 0; y < size - 1; y++) {
            for (let x = 0; x < size - 1; x++) {
                const color = modules[y][x];
                if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
                    penalty += 3;
                }
            }
        }

        // 规则 3：出现类似定位图形的 1:1:3:1:1 组合，每处 40 分
        const patterns: boolean[][] = [
            [true, false, true, true, true, false, true, false, false, false, false],
            [false, false, false, false, true, false, true, true, true, false, true],
        ];
        const matches = (getBitAt: (index: number) => boolean, start: number, pattern: boolean[]): boolean => {
            for (let i = 0; i < pattern.length; i++) {
                if (getBitAt(start + i) !== pattern[i]) {
                    return false;
                }
            }
            return true;
        };
        for (let y = 0; y < size; y++) {
            for (let start = 0; start <= size - 11; start++) {
                for (let p = 0; p < patterns.length; p++) {
                    if (matches((index) => modules[y][index], start, patterns[p])) {
                        penalty += 40;
                    }
                }
            }
        }
        for (let x = 0; x < size; x++) {
            for (let start = 0; start <= size - 11; start++) {
                for (let p = 0; p < patterns.length; p++) {
                    if (matches((index) => modules[index][x], start, patterns[p])) {
                        penalty += 40;
                    }
                }
            }
        }

        // 规则 4：黑色占比偏离 50%，每偏离 5% 加 10 分
        let darkCount = 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (modules[y][x]) {
                    darkCount += 1;
                }
            }
        }
        const total = size * size;
        const percent = (darkCount * 100) / total;
        penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

        return penalty;
    }
}
