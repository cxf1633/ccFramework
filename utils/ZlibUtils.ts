import { inflate, deflate } from 'pako';

export class ZlibUtils {
    /**
     * 解压经过 gzip 压缩并 base64 编码的数据
     * @param compressedBase64 压缩后的base64字符串
     * @returns 解压后的原始字符串
     */
    public static decompress(compressedBase64: string): string {
        try {
            // 将base64转换为Uint8Array
            const binaryString = this.robustAtob(compressedBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 解压数据
            const decompressed = inflate(bytes, { to: 'string' });
            return decompressed;
        } catch (error) {
            console.error('解压失败:', error);
            return '';
        }
    }

    /**
     * 稳健的 atob Polyfill 实现，用于解码 Base64 字符串
     * @param {string} encodedData - Base64 编码的字符串
     * @returns {string} 解码后的原始字符串
     * @throws {Error} 如果输入不是有效的 Base64 字符串，则抛出错误
     */
    public static  robustAtob(encodedData) {
        // Base64 字符集
        const b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        let output = "";
        let chr1, chr2, chr3;
        let enc1, enc2, enc3, enc4;
        let i = 0;

        // 1. 清理输入：移除所有非Base64字符（如换行符、空格等）
        encodedData = String(encodedData).replace(/[^A-Za-z0-9+/=]/g, "");

        // 2. 验证输入合法性：长度必须是4的倍数（清理后）
        if (encodedData.length % 4 === 1) {
            throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
        }

        // 3. 补全等号填充以确保长度是4的倍数（增强容错性）
        const paddingNeeded = encodedData.length % 4;
        if (paddingNeeded) {
            encodedData += '='.repeat(4 - paddingNeeded);
        }

        // 4. 解码过程
        for (; i < encodedData.length;) {
            enc1 = b64.indexOf(encodedData.charAt(i++));
            enc2 = b64.indexOf(encodedData.charAt(i++));
            enc3 = b64.indexOf(encodedData.charAt(i++));
            enc4 = b64.indexOf(encodedData.charAt(i++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            output += String.fromCharCode(chr1);
            if (enc3 !== 64) output += String.fromCharCode(chr2); // 检查第三个字符是否为填充符
            if (enc4 !== 64) output += String.fromCharCode(chr3); // 检查第四个字符是否为填充符
        }
        return output;
    }

    /**
     * 稳健的 btoa Polyfill 实现，用于编码字符串为 Base64
     * @param {string} str - 要编码的字符串
     * @returns {string} Base64 编码的字符串
     */
    public static robustBtoa(str: string): string {
        // 如果原生 btoa 可用，优先使用
        if (typeof btoa !== 'undefined') {
            try {
                return btoa(str);
            } catch (e) {
                // 如果原生 btoa 失败，使用 polyfill
            }
        }
        
        // Base64 字符集
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let result = '';
        let i = 0;
        
        while (i < str.length) {
            const a = str.charCodeAt(i++);
            const b = i < str.length ? str.charCodeAt(i++) : 0;
            const c = i < str.length ? str.charCodeAt(i++) : 0;
            
            const bitmap = (a << 16) | (b << 8) | c;
            
            result += chars.charAt((bitmap >> 18) & 63);
            result += chars.charAt((bitmap >> 12) & 63);
            result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
            result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
        }
        
        return result;
    }

    /**
     * 压缩字符串为 gzip 并转为 base64
     * @param data 原始字符串
     * @returns 压缩后的base64字符串
     */
    public static compress(data: string): string {
        try {
            // 压缩数据
            const compressed = deflate(data);
            
            // 转换为base64
            let binaryString = '';
            compressed.forEach(byte => {
                binaryString += String.fromCharCode(byte);
            });
            return this.robustBtoa(binaryString);
        } catch (error) {
            console.error('压缩失败:', error);
            return '';
        }
    }
}