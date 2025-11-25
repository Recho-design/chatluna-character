"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = apply;
const messages_1 = require("@langchain/core/messages");
const koishi_1 = require("koishi");
const count_tokens_1 = require("koishi-plugin-chatluna/llm-core/utils/count_tokens");
const utils_js_1 = require("../utils.js");
const string_1 = require("koishi-plugin-chatluna/utils/string");
let logger;
async function initializeModel(ctx, platform, modelName) {
    return await ctx.chatluna.createChatModel(platform, modelName);
}
async function setupModelPool(ctx, config) {
    const [platform, modelName] = (0, count_tokens_1.parseRawModelName)(config.model);
    const globalModel = await initializeModel(ctx, platform, modelName);
    logger.info('global model loaded %c', config.model);
    const modelPool = {};
    if (config.modelOverride?.length > 0) {
        for (const override of config.modelOverride) {
            modelPool[override.groupId] = (async () => {
                const [platform, modelName] = (0, count_tokens_1.parseRawModelName)(override.model);
                const loadedModel = await initializeModel(ctx, platform, modelName);
                logger.info('override model loaded %c for group %c', override.model, override.groupId);
                modelPool[override.groupId] = Promise.resolve(loadedModel);
                return loadedModel;
            })();
        }
    }
    return { globalModel, modelPool };
}
async function getModelForGuild(guildId, globalModel, modelPool) {
    return await (modelPool[guildId] ?? Promise.resolve(globalModel));
}
async function getConfigAndPresetForGuild(guildId, config, globalPreset, presetPool, preset) {
    const currentGuildConfig = config.configs[guildId];
    let copyOfConfig = { ...config };
    let currentPreset = globalPreset;
    if (currentGuildConfig) {
        copyOfConfig = Object.assign({}, copyOfConfig, currentGuildConfig);
        currentPreset =
            presetPool[guildId] ??
                (await (async () => {
                    const template = preset.getPresetForCache(currentGuildConfig.preset);
                    presetPool[guildId] = template;
                    return template;
                })());
        logger.debug(`override config: ${JSON.stringify(copyOfConfig)} for guild ${guildId}`);
    }
    return { copyOfConfig, currentPreset };
}
async function prepareMessages(messages, config, session, model, currentPreset, temp, stickerService, chain) {
    const [recentMessage, lastMessage] = await (0, utils_js_1.formatMessage)(messages, config, model, currentPreset.system.rawString, currentPreset.input.rawString);
    const formattedSystemPrompt = await currentPreset.system.format({
        time: '',
        stickers: '',
        status: ''
    }, session.app.chatluna.promptRenderer, {
        session
    });
    if (!chain) {
        logger.debug('messages_new: ' + JSON.stringify(recentMessage));
        logger.debug('messages_last: ' + JSON.stringify(lastMessage));
    }
    const humanMessage = new messages_1.HumanMessage(await currentPreset.input.format({
        history_new: recentMessage
            .join('\n\n')
            .replaceAll('{', '{{')
            .replaceAll('}', '}}'),
        history_last: lastMessage
            .replaceAll('{', '{{')
            .replaceAll('}', '}}'),
        time: (0, utils_js_1.formatTimestamp)(new Date()),
        stickers: JSON.stringify(stickerService.getAllStickTypes()),
        status: temp.status ?? currentPreset.status ?? '',
        prompt: session.content,
        built: {
            preset: currentPreset.name,
            conversationId: session.guildId
        }
    }, session.app.chatluna.promptRenderer, {
        session
    }));
    const tempMessages = [];
    if (config.image) {
        for (const message of messages) {
            if (message.images && message.images.length > 0) {
                /*    for (const image of message.images) {
                    const imageMessage = new HumanMessage(
                        `[image:${image.hash}]`
                    )
                    imageMessage.additional_kwargs = {
                        images: [image.url]
                    }

                } */
                const imageMessage = new messages_1.HumanMessage({
                    content: message.images.flatMap((image) => [
                        { type: 'text', text: image.formatted },
                        { type: 'image_url', image_url: image.url }
                    ])
                });
                tempMessages.push(imageMessage);
            }
        }
    }
    return (0, utils_js_1.formatCompletionMessages)([new messages_1.SystemMessage(formattedSystemPrompt)].concat(temp.completionMessages), tempMessages, humanMessage, config, model);
}
async function getModelResponse(ctx, session, model, completionMessages, config, chain) {
    for (let retryCount = 0; retryCount < 2; retryCount++) {
        try {
            const lastMessage = completionMessages[completionMessages.length - 1];
            const historyMessages = completionMessages.slice(0, -1);
            const systemMessage = chain != null ? historyMessages.shift() : undefined;
            const responseMessage = chain
                ? await chain.invoke({
                    instructions: (0, string_1.getMessageContent)(systemMessage.content),
                    chat_history: historyMessages,
                    input: lastMessage
                }, {
                    configurable: {
                        session,
                        model,
                        userId: session.userId,
                        conversationId: session.guildId
                    }
                })
                : await model.invoke(completionMessages);
            logger.debug('model response: ' + responseMessage.content);
            const parsedResponse = await (0, utils_js_1.parseResponse)(responseMessage.content, config.isAt, async (element) => [element], config);
            return { responseMessage, parsedResponse };
        }
        catch (e) {
            logger.error('model requests failed', e);
            if (retryCount === 1)
                return null;
            await (0, koishi_1.sleep)(3000);
        }
    }
    return null;
}
function calculateMessageDelay(text, elements, typingTime) {
    let maxTime = text.length * typingTime + 100;
    if (elements.length === 1 && elements[0].attrs['code'] === true) {
        maxTime *= 0.1;
    }
    return maxTime;
}
async function handleMessageSending(session, elements, text, parsedResponse, config, maxTime, emoticonStatement, breakSay) {
    const random = new koishi_1.Random();
    if (emoticonStatement !== 'span') {
        await (0, koishi_1.sleep)(random.int(maxTime / 2, maxTime));
    }
    else {
        await (0, koishi_1.sleep)(random.int(maxTime / 12, maxTime / 4));
    }
    try {
        await session.send(elements);
    }
    catch (e) {
        logger.error(e);
        await session.send(elements);
    }
    return false;
}
async function handleStickerSending(session, config, parsedResponse, stickerService) {
    const random = new koishi_1.Random();
    if (Math.random() < config.sendStickerProbability) {
        const sticker = await stickerService.randomStickByType(parsedResponse.sticker);
        await (0, koishi_1.sleep)(random.int(500, 2000));
        await session.send(sticker);
    }
}
async function handleModelResponse(session, config, service, stickerService, parsedResponse) {
    let breakSay = false;
    for (const elements of parsedResponse.elements) {
        const text = elements
            .map((element) => element.attrs.content ?? '')
            .join('');
        const emoticonStatement = (0, utils_js_1.isEmoticonStatement)(text, elements);
        if (elements.length < 1)
            continue;
        const maxTime = text.length > config.largeTextSize
            ? config.largeTextTypingTime
            : calculateMessageDelay(text, elements, config.typingTime);
        breakSay = await handleMessageSending(session, elements, text, parsedResponse, config, maxTime, emoticonStatement, breakSay);
        if (breakSay) {
            break;
        }
    }
    await handleStickerSending(session, config, parsedResponse, stickerService);
    service.mute(session, config.coolDownTime * 1000);
    await service.broadcastOnBot(session, parsedResponse.elements.flat());
}
async function apply(ctx, config) {
    const service = ctx.chatluna_character;
    const preset = service.preset;
    const stickerService = service.stickerService;
    logger = service.logger;
    (0, utils_js_1.setLogger)(logger);
    const { globalModel, modelPool } = await setupModelPool(ctx, config);
    let globalPreset = preset.getPresetForCache(config.defaultPreset);
    let presetPool = {};
    const chainPool = {};
    ctx.on('chatluna_character/preset_updated', () => {
        globalPreset = preset.getPresetForCache(config.defaultPreset);
        presetPool = {};
    });
    service.collect(async (session, messages) => {
        const guildId = session.event.guild?.id ?? session.guildId;
        const model = await getModelForGuild(guildId, globalModel, modelPool);
        const { copyOfConfig, currentPreset } = await getConfigAndPresetForGuild(guildId, config, globalPreset, presetPool, preset);
        if (model.value == null) {
            logger.warn(`Model ${copyOfConfig.model} load not successful. Please check your logs output.`);
            return;
        }
        if (copyOfConfig.toolCalling) {
            chainPool[guildId] =
                chainPool[guildId] ??
                    (await (0, utils_js_1.createChatLunaChain)(ctx, model, session));
        }
        const temp = await service.getTemp(session);
        const completionMessages = await prepareMessages(messages, copyOfConfig, session, model.value, currentPreset, temp, stickerService, chainPool[guildId]?.value);
        if (!chainPool[guildId]) {
            logger.debug('completion message: ' +
                JSON.stringify(completionMessages.map((it) => it.content)));
        }
        const response = await getModelResponse(ctx, session, model.value, completionMessages, copyOfConfig, chainPool[guildId]?.value);
        if (!response) {
            service.releaseResponseLock(session);
            return;
        }
        const { responseMessage, parsedResponse } = response;
        temp.status = parsedResponse.status;
        if (parsedResponse.elements.length < 1) {
            service.mute(session, copyOfConfig.muteTime);
            service.releaseResponseLock(session);
            return;
        }
        // 追加本轮对话的原始 user / assistant 消息
        temp.completionMessages.push(completionMessages[completionMessages.length - 1]);
        temp.completionMessages.push(responseMessage);
        const historyRounds = copyOfConfig.modelCompletionCount ?? 0;
        if (historyRounds <= 0) {
            // 不保留任何历史
            temp.completionMessages = [];
        }
        else {
            const maxMessages = historyRounds * 2;
            // 只保留最近 X 轮（user + assistant 成对）
            while (temp.completionMessages.length > maxMessages) {
                temp.completionMessages.shift();
            }
        }
        await handleModelResponse(session, copyOfConfig, service, stickerService, parsedResponse);
        service.releaseResponseLock(session);
    });
}
