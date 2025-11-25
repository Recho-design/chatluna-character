"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = exports.Config = exports.inject2 = exports.inject = void 0;
exports.apply = apply;
/* eslint-disable max-len */
const koishi_1 = require("koishi");
const plugin_js_1 = require("./plugin.js");
const message_js_1 = require("./service/message.js");
function apply(ctx, config) {
    ctx.plugin(message_js_1.MessageCollector, config);
    ctx.plugin({
        apply: (ctx, config) => {
            ctx.on('ready', async () => {
                await ctx.chatluna_character.stickerService.init();
                await ctx.chatluna_character.preset.init();
                await (0, plugin_js_1.plugins)(ctx, config);
            });
        },
        inject: Object.assign({}, exports.inject2, {
            chatluna_character: {
                required: true
            }
        }),
        name: 'chatluna_character_entry_point'
    }, config);
    ctx.middleware((session, next) => {
        if (!ctx.chatluna_character) {
            return next();
        }
        // 不接收自己的消息
        if (ctx.bots[session.uid]) {
            return next();
        }
        const guildId = session.guildId;
        if (!config.applyGroup.includes(guildId)) {
            return next();
        }
        return next(async (loop) => {
            if (!(await ctx.chatluna_character.broadcast(session))) {
                return loop();
            }
        });
    });
}
exports.inject = {
    required: ['chatluna'],
    optional: ['chatluna_character']
};
exports.inject2 = {
    chatluna: {
        required: true
    },
    chatluna_character: {
        required: false
    }
};
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        applyGroup: koishi_1.Schema.array(koishi_1.Schema.string()).description('应用到的群组'),
        maxMessages: koishi_1.Schema.number()
            .description('存储在内存里的最大消息数量')
            .default(10)
            .min(3)
            .role('slider')
            .max(100),
        disableChatLuna: koishi_1.Schema.boolean()
            .default(true)
            .description('在使用此插件的群聊里，是否禁用 ChatLuna 主功能'),
        whiteListDisableChatLuna: koishi_1.Schema.array(koishi_1.Schema.string()).description('在使用此插件时，不禁用 ChatLuna 主功能的群聊列表')
    }).description('基础配置'),
    koishi_1.Schema.object({
        model: koishi_1.Schema.dynamic('model').default('').description('使用的模型'),
        modelOverride: koishi_1.Schema.array(koishi_1.Schema.object({
            groupId: koishi_1.Schema.string().required().description('群组 ID'),
            model: koishi_1.Schema.dynamic('model').default('').description('模型')
        })).description('针对某个群的模型设置，会覆盖上面的配置'),
        maxTokens: koishi_1.Schema.number()
            .default(5000)
            .min(1024)
            .max(42000)
            .description('聊天的最大 token 数'),
        image: koishi_1.Schema.boolean()
            .description('是否允许输入图片（注意表情包也会输入，目前仅支持原生多模态的模型）')
            .default(false),
        imageInputMaxCount: koishi_1.Schema.number()
            .default(3)
            .min(1)
            .max(15)
            .description('最大的输入图片数量'),
        imageInputMaxSize: koishi_1.Schema.number()
            .default(3)
            .min(1)
            .max(20)
            .description('最大的输入图片大小（MB）'),
        toolCalling: koishi_1.Schema.boolean()
            .description('是否启用工具调用功能')
            .default(false)
    }).description('模型配置'),
    koishi_1.Schema.object({
        isNickname: koishi_1.Schema.boolean()
            .description('允许 bot 配置中的昵称引发回复')
            .default(true),
        isNickNameWithContent: koishi_1.Schema.boolean()
            .description('是否允许在对话内容里任意匹配 bot 配置中的昵称来触发对话')
            .default(false),
        isForceMute: koishi_1.Schema.boolean()
            .description('是否启用强制禁言（当聊天涉及到关键词时则会禁言，关键词需要在预设文件里配置）')
            .default(true),
        isAt: koishi_1.Schema.boolean()
            .description('是否允许 bot 艾特他人')
            .default(true),
        splitSentence: koishi_1.Schema.boolean()
            .description('是否启用自分割发送消息 **注意请确保你的预设和模型在使用时支持自分割消息，否则请不要关闭**')
            .default(true),
        markdownRender: koishi_1.Schema.boolean()
            .description('是否启用 Markdown 渲染。关闭后可能会损失分割消息的精度')
            .default(true),
        messageInterval: koishi_1.Schema.number()
            .default(14)
            .min(0)
            .role('slider')
            .max(10000)
            .description('随机发送消息的最大间隔'),
        messageActivityScoreLowerLimit: koishi_1.Schema.number()
            .default(0.85)
            .min(0)
            .max(1)
            .role('slider')
            .step(0.00001)
            .description('消息活跃度分数的下限阈值。初始状态或长时间无人回复后，会使用此阈值判断是否响应。'),
        messageActivityScoreUpperLimit: koishi_1.Schema.number()
            .default(0.85)
            .min(0)
            .max(1)
            .role('slider')
            .step(0.00001)
            .description('消息活跃度分数的上限阈值。每次响应后，判断阈值会向此值靠拢。若下限 < 上限（如 0.1 → 0.9），则会越聊越少；若下限 > 上限（如 0.9 → 0.2），则会越聊越多。十分钟内无人回复时，会自动回退到下限。'),
        coolDownTime: koishi_1.Schema.number()
            .default(10)
            .min(0)
            .max(60 * 24)
            .description('冷却发言时间（秒）'),
        typingTime: koishi_1.Schema.number()
            .default(440)
            .min(100)
            .role('slider')
            .max(1500)
            .description('模拟打字时的间隔（毫秒）'),
        largeTextSize: koishi_1.Schema.number()
            .default(300)
            .min(100)
            .max(1000)
            .description('大文本消息的判断阈值（字符数）'),
        largeTextTypingTime: koishi_1.Schema.number()
            .default(100)
            .min(10)
            .max(1500)
            .description('大文本消息的固定打字间隔（毫秒）'),
        muteTime: koishi_1.Schema.number()
            .default(1000 * 60)
            .min(1000)
            .max(1000 * 60 * 10 * 10)
            .description('闭嘴时的禁言时间（毫秒）'),
        modelCompletionCount: koishi_1.Schema.number()
            .default(3)
            .min(0)
            .max(60)
            .description('模型历史消息轮数，为 0 不发送之前的历史轮次'),
        sendStickerProbability: koishi_1.Schema.number()
            .default(0.0)
            .min(0)
            .max(1)
            .role('slider')
            .step(0.01)
            .description('发送表情的概率（即将废弃，将制作新的表情系统插件）'),
        defaultPreset: koishi_1.Schema.dynamic('character-preset')
            .description('使用的伪装预设')
            .default('煕')
    }).description('对话设置'),
    koishi_1.Schema.object({
        configs: koishi_1.Schema.dict(koishi_1.Schema.object({
            maxTokens: koishi_1.Schema.number()
                .default(4000)
                .min(1024)
                .max(20000)
                .description('使用聊天的最大 token 数'),
            isAt: koishi_1.Schema.boolean().description('是否启用@').default(true),
            splitSentence: koishi_1.Schema.boolean()
                .description('是否启用自分割发送消息 **注意请确保你的预设和模型在使用时支持自分割消息，否则请不要关闭**')
                .default(true),
            markdownRender: koishi_1.Schema.boolean()
                .description('是否启用 Markdown 渲染。关闭后可能会损失分割消息的精度')
                .default(true),
            isNickname: koishi_1.Schema.boolean()
                .description('允许 bot 配置中的昵称引发回复')
                .default(true),
            isNickNameWithContent: koishi_1.Schema.boolean()
                .description('是否允许在对话内容里任意匹配 bot 配置中的昵称来触发对话')
                .default(false),
            isForceMute: koishi_1.Schema.boolean()
                .description('是否启用强制禁言（当聊天涉及到关键词时则会禁言，关键词需要在预设文件里配置）')
                .default(true),
            messageInterval: koishi_1.Schema.number()
                .default(10)
                .min(0)
                .role('slider')
                .max(10000)
                .description('随机发送消息的间隔。群越活跃，这个值就会越高。'),
            messageActivityScoreLowerLimit: koishi_1.Schema.number()
                .default(0.85)
                .min(0)
                .max(1)
                .role('slider')
                .step(0.00001)
                .description('消息活跃度分数的下限阈值。初始状态或长时间无人回复后，会使用此阈值判断是否响应。'),
            messageActivityScoreUpperLimit: koishi_1.Schema.number()
                .default(0.85)
                .min(0)
                .max(1)
                .role('slider')
                .step(0.00001)
                .description('消息活跃度分数的上限阈值。每次响应后，判断阈值会向此值靠拢。若下限 < 上限（如 0.1 → 0.9），则会越聊越少；若下限 > 上限（如 0.9 → 0.2），则会越聊越多。十分钟内无人回复时，会自动回退到下限。'),
            toolCalling: koishi_1.Schema.boolean()
                .description('是否启用工具调用功能')
                .default(false),
            image: koishi_1.Schema.boolean()
                .description('是否允许输入图片（注意表情包也会输入，目前仅支持原生多模态的模型）')
                .default(false),
            imageInputMaxCount: koishi_1.Schema.number()
                .default(3)
                .min(1)
                .max(15)
                .description('最大的输入图片数量'),
            imageInputMaxSize: koishi_1.Schema.number()
                .default(1024 * 1024 * 10)
                .min(1024 * 1024 * 1)
                .max(1024 * 1024 * 20)
                .description('最大的输入图片大小（KB）'),
            coolDownTime: koishi_1.Schema.number()
                .default(10)
                .min(1)
                .max(60 * 24 * 24)
                .description('冷却发言时间（秒）'),
            typingTime: koishi_1.Schema.number()
                .default(440)
                .min(100)
                .role('slider')
                .max(1700)
                .description('模拟打字时的间隔（毫秒）'),
            largeTextSize: koishi_1.Schema.number()
                .default(300)
                .min(100)
                .max(1000)
                .description('大文本消息的判断阈值（每段分句的字符数）'),
            largeTextTypingTime: koishi_1.Schema.number()
                .default(100)
                .min(10)
                .max(1500)
                .description('大文本消息的模拟打字间隔（毫秒）'),
            muteTime: koishi_1.Schema.number()
                .default(1000 * 60)
                .min(1000)
                .max(1000 * 60 * 10 * 10)
                .description('闭嘴时的禁言时间（毫秒）'),
            modelCompletionCount: koishi_1.Schema.number()
                .default(3)
                .min(0)
                .max(6)
                .description('模型历史消息轮数，为 0 不发送之前的历史轮次'),
            sendStickerProbability: koishi_1.Schema.number()
                .default(0)
                .min(0)
                .max(1)
                .role('slider')
                .step(0.01)
                .description('发送表情的概率'),
            preset: koishi_1.Schema.dynamic('character-preset')
                .description('使用的伪装预设')
                .default('煕')
        }))
            .role('table')
            .description('分群配置，会覆盖上面的默认配置（键填写群号）')
    }).description('分群配置')
]);
exports.name = 'chatluna-character';
