import { Context } from 'koishi';
import { PresetTemplate } from './types.js';
export declare class Preset {
    private readonly ctx;
    private readonly _presets;
    private _aborter;
    constructor(ctx: Context);
    loadAllPreset(): Promise<void>;
    getPreset(triggerKeyword: string, loadForDisk?: boolean, throwError?: boolean): Promise<PresetTemplate>;
    watchPreset(): void;
    init(): Promise<void>;
    getPresetForCache(triggerKeyword: string, throwError?: boolean): PresetTemplate;
    getDefaultPreset(): Promise<PresetTemplate>;
    getAllPreset(): Promise<string[]>;
    resetDefaultPreset(): Promise<void>;
    resolvePresetDir(): string;
    private _checkPresetDir;
    private _copyDefaultPresets;
}
export declare function loadPreset(text: string): PresetTemplate;
declare module 'koishi' {
    interface Events {
        'chatluna_character/preset_updated': () => void;
    }
}
