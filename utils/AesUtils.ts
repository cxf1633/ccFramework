import { AES, Utf8, CBC, Pkcs7 } from 'crypto-es';

export class AesUtils {
    private static readonly KEY = Utf8.parse("1234567890141414"); // 密钥
    private static readonly IV = Utf8.parse("1234567890141414"); // 偏移量

    /**
     * AES加密
     * @param plainText 明文
     * @returns 加密后的base64字符串
     */
    public static encrypt(plainText: string): string {
        const encrypted = AES.encrypt(
            plainText,
            this.KEY,
            {
                iv: this.IV,
                mode: CBC,
                padding: Pkcs7
            }
        );
        
        return encrypted.toString();
    }

    /**
     * AES解密
     * @param cipherText 密文(base64格式)
     * @returns 解密后的字符串
     */
    public static decrypt(cipherText: string): string {
        const decrypted = AES.decrypt(
            cipherText,
            this.KEY,
            {
                iv: this.IV,
                mode: CBC,
                padding: Pkcs7
            }
        );
        return decrypted.toString(Utf8);
    }
}