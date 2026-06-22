
export class Singleton {

    _instance!: Singleton;

    static getInstance<T extends Singleton>(this: new () => T): T {
        if (!(<any>this)._instance) {
            (<any>this)._instance = new this();
        }
        return (<any>this)._instance;
    }

}
