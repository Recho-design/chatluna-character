import { Context, h } from 'koishi';
import { Config } from '..';
export declare class StickerService {
    private _ctx;
    private _config;
    private _stickers;
    constructor(_ctx: Context, _config: Config);
    init(): Promise<void>;
    getAllStickTypes(): string[];
    randomStickByType(type: string): Promise<h>;
    randomStick(): Promise<h>;
}
