"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Preset = void 0;
exports.loadPreset = loadPreset;
const promises_1 = __importDefault(require("fs/promises"));
const js_yaml_1 = require("js-yaml");
const koishi_1 = require("koishi");
const error_1 = require("koishi-plugin-chatluna/utils/error");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
class Preset {
    constructor(ctx) {
        this.ctx = ctx;
        this._presets = [];
        this._aborter = null;
        ctx.on('dispose', () => {
            this._aborter?.abort();
        });
    }
    async loadAllPreset() {
        await this._checkPresetDir();
        const presetDir = this.resolvePresetDir();
        const files = await promises_1.default.readdir(presetDir);
        this._presets.length = 0;
        for (const file of files) {
            try {
                // use file
                const extension = path_1.default.extname(file);
                if (extension !== '.yml') {
                    continue;
                }
                const rawText = await promises_1.default.readFile(path_1.default.join(presetDir, file), 'utf-8');
                const preset = loadPreset(rawText);
                preset.path = path_1.default.join(presetDir, file);
                this._presets.push(preset);
            }
            catch (e) {
                this.ctx.chatluna_character.logger.error(`error when load ${file}`, e);
            }
        }
        this.ctx.schema.set('character-preset', koishi_1.Schema.union(this._presets
            .map((preset) => preset.name)
            .concat('无')
            .map((name) => koishi_1.Schema.const(name))));
        this.ctx.emit('chatluna_character/preset_updated');
    }
    async getPreset(triggerKeyword, loadForDisk = true, throwError = true) {
        if (loadForDisk) {
            // always load for disk
            await this.loadAllPreset();
        }
        return this.getPresetForCache(triggerKeyword, throwError);
    }
    watchPreset() {
        let fsWait = false;
        if (this._aborter != null) {
            this._aborter.abort();
        }
        this._aborter = new AbortController();
        (0, fs_1.watch)(this.resolvePresetDir(), {
            signal: this._aborter.signal
        }, async (event, filename) => {
            if (filename) {
                if (fsWait)
                    return;
                fsWait = setTimeout(() => {
                    fsWait = false;
                }, 100);
                await this.loadAllPreset();
                this.ctx.chatluna_character.logger.debug(`trigger full reload preset by ${filename}`);
                return;
            }
            await this.loadAllPreset();
            this.ctx.chatluna_character.logger.debug(`trigger full reload preset`);
        });
    }
    async init() {
        await this.loadAllPreset();
        this.watchPreset();
    }
    getPresetForCache(triggerKeyword, throwError = true) {
        const preset = this._presets.find((preset) => preset.name === triggerKeyword);
        if (preset) {
            return preset;
        }
        if (throwError) {
            throw new error_1.ChatLunaError(error_1.ChatLunaErrorCode.PRESET_NOT_FOUND, new Error(`No preset found for keyword ${triggerKeyword}`));
        }
        return undefined;
    }
    async getDefaultPreset() {
        if (this._presets.length === 0) {
            await this.loadAllPreset();
        }
        const preset = this._presets.find((preset) => preset.name === '默认');
        if (preset) {
            // await this.cache.set('default-preset', 'chatgpt')
            return preset;
        }
        else {
            await this._copyDefaultPresets();
            return this.getDefaultPreset();
        }
        // throw new Error("No default preset found")
    }
    async getAllPreset() {
        await this.loadAllPreset();
        return this._presets.map((preset) => preset.name);
    }
    async resetDefaultPreset() {
        await this._copyDefaultPresets();
    }
    resolvePresetDir() {
        return path_1.default.resolve(this.ctx.baseDir, 'data/chathub/character/presets');
    }
    async _checkPresetDir() {
        const presetDir = path_1.default.join(this.resolvePresetDir());
        let needCopy = false;
        // 检查预设目录是否存在，如果不存在或存在但没有任何 yml 预设，则复制默认预设
        try {
            await promises_1.default.access(presetDir);
            const files = await promises_1.default.readdir(presetDir);
            const hasYmlPreset = files.some((file) => path_1.default.extname(file) === '.yml');
            if (!hasYmlPreset) {
                needCopy = true;
            }
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                await promises_1.default.mkdir(presetDir, { recursive: true });
                needCopy = true;
            }
            else {
                throw err;
            }
        }
        if (needCopy) {
            await this._copyDefaultPresets();
        }
    }
    async _copyDefaultPresets() {
        const currentPresetDir = path_1.default.join(this.resolvePresetDir());
        const dirname = __dirname;
        const defaultPresetDir = path_1.default.join(dirname, '../resources/presets');
        const files = await promises_1.default.readdir(defaultPresetDir);
        for (const file of files) {
            const filePath = path_1.default.join(defaultPresetDir, file);
            const fileStat = await promises_1.default.stat(filePath);
            if (fileStat.isFile()) {
                await promises_1.default.mkdir(currentPresetDir, { recursive: true });
                this.ctx.chatluna_character.logger.debug(`copy preset file ${filePath} to ${currentPresetDir}`);
                await promises_1.default.copyFile(filePath, path_1.default.join(currentPresetDir, file));
            }
        }
    }
}
exports.Preset = Preset;
function loadPreset(text) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPreset = (0, js_yaml_1.load)(text);
    let input;
    let system;
    try {
        input = {
            rawString: rawPreset.input,
            format: async (variables, variableService, configurable) => {
                return await variableService
                    .renderTemplate(rawPreset.input, variables, {
                    configurable
                })
                    .then((result) => result.text);
            }
        };
    }
    catch (e) {
        throw new error_1.ChatLunaError(error_1.ChatLunaErrorCode.PRESET_LOAD_ERROR, new Error(`input format error: ${rawPreset.input} in ${rawPreset}`));
    }
    try {
        system = {
            rawString: rawPreset.system,
            format: async (variables, variableService, configurable) => {
                return await variableService
                    .renderTemplate(rawPreset.system, variables, {
                    configurable
                })
                    .then((result) => result.text);
            }
        };
    }
    catch (e) {
        throw new error_1.ChatLunaError(error_1.ChatLunaErrorCode.PRESET_LOAD_ERROR, new Error(`system format error: ${rawPreset.system} in ${rawPreset}`));
    }
    return {
        name: rawPreset.name,
        nick_name: rawPreset.nick_name,
        input,
        system,
        mute_keyword: rawPreset.mute_keyword ?? [],
        status: rawPreset?.status
    };
}
