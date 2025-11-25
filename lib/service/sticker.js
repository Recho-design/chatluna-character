"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StickerService = void 0;
const koishi_1 = require("koishi");
const path_1 = __importDefault(require("path"));
const promises_1 = __importStar(require("fs/promises"));
class StickerService {
    constructor(_ctx, _config) {
        this._ctx = _ctx;
        this._config = _config;
        this._stickers = {};
    }
    async init() {
        const sickerDir = path_1.default.resolve(this._ctx.baseDir, 'data/chathub/character/sticker');
        // check if the dir exists
        try {
            await promises_1.default.access(sickerDir);
        }
        catch (error) {
            // copy the resource dir to the target dir
            await promises_1.default.mkdir(sickerDir, { recursive: true });
            const dirname = __dirname;
            await promises_1.default.cp(path_1.default.resolve(dirname, '../resources/sticker'), sickerDir, {
                recursive: true
            });
        }
        // read the dir
        const dirs = await promises_1.default.readdir(sickerDir);
        for (const dirName of dirs) {
            const dir = path_1.default.resolve(sickerDir, dirName);
            const stats = await promises_1.default.stat(dir);
            if (stats.isDirectory()) {
                const stickers = await promises_1.default.readdir(dir);
                this._stickers[dirName] = stickers.map((sticker) => path_1.default.resolve(dir, sticker));
            }
        }
        if (Object.keys(this._stickers).length > 0) {
            this._ctx.logger.warn('Sticker Service is deprecated. In future, we will make the new sticker system.');
        }
    }
    getAllStickTypes() {
        return Object.keys(this._stickers);
    }
    async randomStickByType(type) {
        const allStickers = this._stickers[type];
        if (!allStickers) {
            return this.randomStick();
        }
        // random a sticker
        const index = Math.floor(Math.random() * allStickers.length);
        const sticker = allStickers[index];
        if (!sticker) {
            return undefined;
        }
        this._ctx.root.chatluna_character.logger.debug(`send sticker: ${sticker}`);
        return koishi_1.h.image(await (0, promises_1.readFile)(sticker), `image/${getFileType(sticker)}`);
    }
    async randomStick() {
        const allStickers = Object.values(this._stickers).flat();
        // random a sticker
        const index = Math.floor(Math.random() * allStickers.length);
        const sticker = allStickers[index];
        if (!sticker) {
            return undefined;
        }
        this._ctx.root.chatluna_character.logger.debug(`send sticker: ${sticker}`);
        return koishi_1.h.image(await (0, promises_1.readFile)(sticker), `image/${getFileType(sticker)}`);
    }
}
exports.StickerService = StickerService;
function getFileType(path) {
    const type = path.split('.').pop().toLocaleLowerCase();
    if (type === 'jpg') {
        return 'jpeg';
    }
    return type;
}
