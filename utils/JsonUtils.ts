export class JsonUtils {
    public static parseArray<T>(value: string | readonly T[] | null | undefined, warningTag: string = "JsonUtils"): T[] {
        if (Array.isArray(value)) {
            return [...value];
        }

        if (typeof value !== "string" || value.length <= 0) {
            return [];
        }

        try {
            const data = JSON.parse(value);
            return Array.isArray(data) ? data as T[] : [];
        } catch (error) {
            console.warn(`[${warningTag}] Invalid json array`, value, error);
            return [];
        }
    }
}
