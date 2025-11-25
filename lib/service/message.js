"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageCollector = void 0;
exports.getNotEmptyString = getNotEmptyString;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const events_1 = __importDefault(require("events"));
const koishi_1 = require("koishi");
const logger_1 = require("koishi-plugin-chatluna/utils/logger");
const preset_js_1 = require("../preset.js");
const sticker_js_1 = require("./sticker.js");
const string_1 = require("koishi-plugin-chatluna/utils/string");
class MessageCollector extends koishi_1.Service {
    constructor(ctx, _config) {
        super(ctx, 'chatluna_character');
        this.ctx = ctx;
        this._config = _config;
        this._messages = {};
        this._eventEmitter = new events_1.default();
        this._filters = [];
        this._groupLocks = {};
        this._groupTemp = {};
        this.stickerService = new sticker_js_1.StickerService(ctx, _config);
        this.logger = (0, logger_1.createLogger)(ctx, 'chatluna-character');
        this.preset = new preset_js_1.Preset(ctx);
    }
    addFilter(filter) {
        this._filters.push(filter);
    }
    mute(session, time) {
        const lock = this._getGroupLocks(session.guildId);
        let mute = lock.mute ?? 0;
        if (mute < new Date().getTime()) {
            mute = new Date().getTime() + time;
        }
        else {
            mute = mute + time;
        }
        lock.mute = mute;
    }
    collect(func) {
        this._eventEmitter.on('collect', func);
    }
    getMessages(groupId) {
        return this._messages[groupId];
    }
    isMute(session) {
        const lock = this._getGroupLocks(session.guildId);
        return lock.mute > new Date().getTime();
    }
    isResponseLocked(session) {
        const lock = this._getGroupLocks(session.guildId);
        return lock.responseLock;
    }
    setResponseLock(session) {
        const lock = this._getGroupLocks(session.guildId);
        lock.responseLock = true;
    }
    releaseResponseLock(session) {
        const lock = this._getGroupLocks(session.guildId);
        lock.responseLock = false;
    }
    async updateTemp(session, temp) {
        await this._lock(session);
        const groupId = session.guildId;
        this._groupTemp[groupId] = temp;
        await this._unlock(session);
    }
    async getTemp(session) {
        await this._lock(session);
        const groupId = session.guildId;
        const temp = this._groupTemp[groupId] ?? {
            completionMessages: []
        };
        this._groupTemp[groupId] = temp;
        await this._unlock(session);
        return temp;
    }
    _getGroupLocks(groupId) {
        if (!this._groupLocks[groupId]) {
            this._groupLocks[groupId] = {
                lock: false,
                mute: 0,
                responseLock: false
            };
        }
        return this._groupLocks[groupId];
    }
    _getGroupConfig(groupId) {
        const config = this._config;
        if (!config.configs[groupId]) {
            return config;
        }
        return Object.assign({}, config, config.configs[groupId]);
    }
    _lock(session) {
        const groupLock = this._getGroupLocks(session.guildId);
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (!groupLock.lock) {
                    groupLock.lock = true;
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }
    _unlock(session) {
        const groupLock = this._getGroupLocks(session.guildId);
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (groupLock.lock) {
                    groupLock.lock = false;
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }
    clear(groupId) {
        if (groupId) {
            this._messages[groupId] = [];
        }
        else {
            this._messages = {};
        }
        this._groupTemp[groupId] = {
            completionMessages: []
        };
    }
    async broadcastOnBot(session, elements) {
        if (session.isDirect) {
            return;
        }
        await this._lock(session);
        const groupId = session.guildId;
        const maxMessageSize = this._config.maxMessages;
        const groupArray = this._messages[groupId]
            ? this._messages[groupId]
            : [];
        const content = mapElementToString(session, session.content, elements);
        if (content.length < 1) {
            await this._unlock(session);
            return;
        }
        // 使用预设名作为 bot 名称前缀，优先使用分群配置的 preset，没有则使用全局默认预设
        const groupConfig = this._config.configs[groupId];
        const presetName = groupConfig?.preset ?? this._config.defaultPreset;
        let botName = session.bot.user.name;
        const botId = '';
        if (presetName) {
            const preset = this.preset.getPresetForCache(presetName, false);
            if (preset) {
                botName = preset.name;
            }
        }
        const message = {
            content,
            name: botName,
            id: botId,
            timestamp: session.event.timestamp
        };
        groupArray.push(message);
        while (groupArray.length > maxMessageSize) {
            groupArray.shift();
        }
        this._messages[groupId] = groupArray;
        await this._unlock(session);
    }
    async broadcast(session) {
        if (session.isDirect) {
            return;
        }
        await this._lock(session);
        const groupId = session.guildId;
        const maxMessageSize = this._config.maxMessages;
        let groupArray = this._messages[groupId] ? this._messages[groupId] : [];
        const config = this._getGroupConfig(groupId);
        const images = config.image
            ? await getImages(this.ctx, config.model, session)
            : undefined;
        const elements = session.elements
            ? session.elements
            : [koishi_1.h.text(session.content)];
        const content = mapElementToString(session, session.content, elements);
        if (content.length < 1) {
            await this._unlock(session);
            return;
        }
        const message = {
            content,
            name: getNotEmptyString(session.author?.nick, session.author?.name, session.event.user?.name, session.username),
            id: session.author.id,
            timestamp: session.event.timestamp,
            quote: session.quote
                ? {
                    content: mapElementToString(session, session.quote.content, session.quote.elements ?? [
                        koishi_1.h.text(session.quote.content)
                    ]),
                    name: session.quote?.user?.name,
                    id: session.quote?.user?.id
                }
                : undefined,
            images
        };
        groupArray.push(message);
        while (groupArray.length > maxMessageSize) {
            groupArray.shift();
        }
        const now = Date.now();
        groupArray = groupArray.filter((message) => {
            return (message.timestamp == null ||
                message.timestamp >= now - koishi_1.Time.hour);
        });
        await this._processImages(groupArray, config);
        this._messages[groupId] = groupArray;
        if (this._filters.some((func) => func(session, message)) &&
            !this.isMute(session)) {
            this.setResponseLock(session);
            this._eventEmitter.emit('collect', session, groupArray);
            await this._unlock(session);
            return true;
        }
        else {
            await this._unlock(session);
            return this.isMute(session);
        }
    }
    async _processImages(groupArray, config) {
        if (!config.image)
            return;
        const maxCount = config.imageInputMaxCount || 3;
        const maxSize = config.imageInputMaxSize * 1024 * 1024 || 1024 * 1024 * 10;
        let currentCount = 0;
        let currentSize = 0;
        for (let i = groupArray.length - 1; i >= 0; i--) {
            const message = groupArray[i];
            if (!message.images || message.images.length === 0)
                continue;
            const validImages = [];
            for (const image of message.images) {
                const imageSize = await this._getImageSize(image.url);
                if (currentCount < maxCount &&
                    currentSize + imageSize <= maxSize) {
                    validImages.push(image);
                    currentCount++;
                    currentSize += imageSize;
                }
                else {
                    break;
                }
            }
            if (validImages.length === 0) {
                delete message.images;
            }
            else {
                message.images = validImages;
            }
            if (currentCount >= maxCount || currentSize >= maxSize) {
                for (let j = i - 1; j >= 0; j--) {
                    if (groupArray[j].images) {
                        delete groupArray[j].images;
                    }
                }
                break;
            }
        }
    }
    async _getImageSize(base64Image) {
        if (!base64Image.startsWith('data:')) {
            const resp = await this.ctx.http.get(base64Image, {
                responseType: 'arraybuffer'
            });
            return resp.byteLength;
        }
        try {
            const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
            return Math.ceil((base64Data.length * 3) / 4);
        }
        catch {
            return 0;
        }
    }
}
exports.MessageCollector = MessageCollector;
function mapElementToString(session, content, elements) {
    const filteredBuffer = [];
    for (const element of elements) {
        if (element.type === 'text') {
            const content = element.attrs.content;
            if (content?.trimEnd()?.length > 0) {
                filteredBuffer.push(content);
            }
        }
        else if (element.type === 'at') {
            let name = element.attrs?.name;
            if (element.attrs.id === session.bot.selfId) {
                name = name ?? session.bot.user.name ?? '0';
            }
            if (name == null || name.length < 1) {
                name = element.attrs.id ?? '0';
            }
            filteredBuffer.push(`<at name='${name}'>${element.attrs.id}</at>`);
        }
        else if (element.type === 'img') {
            const imageHash = element.attrs.imageHash;
            const imageUrl = element.attrs.imageUrl;
            if (imageUrl) {
                filteredBuffer.push(`<sticker>${imageUrl}</sticker>`);
            }
            else {
                filteredBuffer.push(`[image` + imageHash
                    ? `:${imageHash}`
                    : imageUrl
                        ? `:${imageUrl}`
                        : '' + `]`);
            }
        }
        else if (element.type === 'face') {
            filteredBuffer.push(`<face name='${element.attrs.name}'>${element.attrs.id}</face>`);
        }
    }
    if (content.trimEnd().length < 1 && filteredBuffer.length < 1) {
        return '';
    }
    return filteredBuffer.join('');
}
// 返回 base64 的图片编码
async function getImages(ctx, model, session) {
    const mergedMessage = await ctx.chatluna.messageTransformer.transform(session, session.elements, model);
    if (typeof mergedMessage.content === 'string') {
        return undefined;
    }
    const images = mergedMessage.content.filter(string_1.isMessageContentImageUrl);
    if (!images || images.length < 1) {
        return undefined;
    }
    return images.map((image) => {
        const url = typeof image.image_url === 'string'
            ? image.image_url
            : image.image_url.url;
        const hash = typeof image.image_url !== 'string' ? image.image_url['hash'] : '';
        const formatted = hash ? `[image:${hash}]` : `<sticker>${url}</sticker>`;
        return { url, hash, formatted };
    });
}
function getNotEmptyString(...texts) {
    for (const text of texts) {
        if (text && text?.length > 0) {
            return text;
        }
    }
}
