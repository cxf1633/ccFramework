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

    /**
     * 账号密码字段的加密（登录 100/1001、注册 100/1003、重置密码 100/1005 的 password / newPassword）。
     *
     * 服务端要求密码字段本身也走 AES，和协议外壳用同一套密钥，所以客户端不发明文密码；
     * 所有发送密码的地方一律走这里，保证注册与登录发出的密码形态一致。
     *
     * 注意：这是可逆加密（服务端能还原明文），只解决“不发明文”，
     * 落库强度取决于服务端是否再叠加哈希。
     */
    public static encryptPassword(plainPassword: string): string {
        return this.encrypt(plainPassword);
    }
}