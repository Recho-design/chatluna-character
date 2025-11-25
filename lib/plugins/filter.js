"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupInfos = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
exports.groupInfos = {};
// 活跃度算法常量配置
const WINDOW_SIZE = 90; // 时间戳窗口最大容量
const RECENT_WINDOW = koishi_1.Time.second * 90; // 频率统计窗口：1.5分钟
const SHORT_BURST_WINDOW = koishi_1.Time.second * 30; // 爆发检测窗口：30秒
const INSTANT_WINDOW = koishi_1.Time.second * 20; // 短周期窗口，用于检测瞬时活跃
const MIN_COOLDOWN_TIME = koishi_1.Time.second * 6; // 最小冷却时间：6秒
const COOLDOWN_PENALTY = 0.8; // 响应后降低活跃度的惩罚值
const THRESHOLD_RESET_TIME = koishi_1.Time.minute * 10; // 十分钟无人回复时，重置活跃度阈值
const MIN_RECENT_MESSAGES = 6; // 进入活跃度统计的最小消息数
const SUSTAINED_RATE_THRESHOLD = 10; // 持续活跃阈值（条/分钟）
const SUSTAINED_RATE_SCALE = 3; // 持续活跃斜率，越大越平缓
const INSTANT_RATE_THRESHOLD = 9; // 瞬时活跃阈值（条/分钟）
const INSTANT_RATE_SCALE = 2; // 瞬时活跃斜率
const BURST_RATE_THRESHOLD = 12; // 突发活跃阈值（条/分钟）
const BURST_RATE_SCALE = 4; // 突发活跃斜率
const SMOOTHING_WINDOW = koishi_1.Time.second * 8; // 分数平滑窗口
const FRESHNESS_HALF_LIFE = koishi_1.Time.second * 60; // 新鲜度半衰期：60秒
async function apply(ctx, config) {
    const service = ctx.chatluna_character;
    const preset = service.preset;
    const logger = service.logger;
    const globalPreset = await preset.getPreset(config.defaultPreset);
    const presetPool = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx.on('guild-member', (session) => {
        if (!config.applyGroup.includes(session.guildId) ||
            session.event?.subtype !== 'ban' ||
            session.bot.selfId !== session.event?.user?.id) {
            return;
        }
        const duration = (session.event._data?.['duration'] ?? 60) * 1000;
        if (duration === 0) {
            ctx.chatluna_character.mute(session, 0);
            return;
        }
        logger.warn(`检测到 ${session.bot.user?.name || session.selfId} 被 ${session.operatorId} 操作禁言 ${duration / 1000} 秒？`);
        ctx.chatluna_character.mute(session, duration);
    });
    service.addFilter((session, message) => {
        const guildId = session.guildId;
        const now = Date.now();
        const currentGuildConfig = config.configs[guildId];
        let copyOfConfig = Object.assign({}, config);
        let currentPreset = globalPreset;
        if (currentGuildConfig != null) {
            copyOfConfig = Object.assign({}, copyOfConfig, currentGuildConfig);
            currentPreset =
                presetPool[guildId] ??
                    (() => {
                        const template = preset.getPresetForCache(currentGuildConfig.preset);
                        presetPool[guildId] = template;
                        return template;
                    })();
        }
        const info = exports.groupInfos[guildId] ?? {
            messageCount: 0,
            messageTimestamps: [],
            lastActivityScore: 0,
            lastScoreUpdate: 0,
            lastResponseTime: 0,
            currentActivityThreshold: copyOfConfig.messageActivityScoreLowerLimit,
            pendingResponse: false,
            lastUserMessageTime: now
        };
        info.messageTimestamps.push(now);
        if (info.messageTimestamps.length > WINDOW_SIZE) {
            info.messageTimestamps.shift();
        }
        if (now - info.lastUserMessageTime >= THRESHOLD_RESET_TIME) {
            info.currentActivityThreshold = copyOfConfig.messageActivityScoreLowerLimit;
        }
        info.lastUserMessageTime = now;
        const activity = calculateActivityScore(info.messageTimestamps, info.lastResponseTime, copyOfConfig.maxMessages, info.lastActivityScore, info.lastScoreUpdate);
        info.lastActivityScore = activity.score;
        info.lastScoreUpdate = activity.timestamp;
        logger.debug(`messageCount: ${info.messageCount}, activityScore: ${activity.score.toFixed(3)}. content: ${JSON.stringify(Object.assign({}, message, { images: undefined }))}`);
        if (copyOfConfig.disableChatLuna &&
            copyOfConfig.whiteListDisableChatLuna.includes(guildId)) {
            const selfId = session.bot.userId ?? session.bot.selfId ?? '0';
            const guildMessages = ctx.chatluna_character.getMessages(guildId);
            let maxRecentMessage = 0;
            if (guildMessages == null || guildMessages.length === 0) {
                maxRecentMessage = 6;
            }
            while (maxRecentMessage < 5) {
                const currentMessage = guildMessages[guildMessages?.length - 1 - maxRecentMessage];
                if (currentMessage == null) {
                    return false;
                }
                if (currentMessage.id === selfId) {
                    break;
                }
                maxRecentMessage++;
            }
        }
        let appel = session.stripped.appel;
        const botId = session.bot.selfId;
        if (!appel) {
            // 从消息元素中检测是否有被艾特当前用户
            appel = session.elements.some((element) => element.type === 'at' && element.attrs?.['id'] === botId);
        }
        if (!appel) {
            appel = session.quote?.user?.id === botId;
        }
        if (copyOfConfig.isForceMute &&
            appel &&
            currentPreset.mute_keyword?.length > 0) {
            const needMute = currentPreset.mute_keyword.some((value) => message.content.includes(value));
            if (needMute) {
                logger.debug(`mute content: ${message.content}`);
                service.mute(session, config.muteTime);
            }
        }
        const isMute = service.isMute(session);
        const isDirectTrigger = appel ||
            (copyOfConfig.isNickname &&
                currentPreset.nick_name.some((value) => message.content.startsWith(value))) ||
            (copyOfConfig.isNickNameWithContent &&
                currentPreset.nick_name.some((value) => message.content.includes(value)));
        const shouldRespond = info.messageCount > copyOfConfig.messageInterval ||
            isDirectTrigger ||
            info.lastActivityScore > info.currentActivityThreshold;
        const isLocked = service.isResponseLocked(session);
        if (info.pendingResponse && !isLocked) {
            info.pendingResponse = false;
            info.messageCount = 0;
            info.lastActivityScore = Math.max(0, info.lastActivityScore - COOLDOWN_PENALTY);
            info.lastResponseTime = now;
            const lowerLimit = copyOfConfig.messageActivityScoreLowerLimit;
            const upperLimit = copyOfConfig.messageActivityScoreUpperLimit;
            const step = (upperLimit - lowerLimit) * 0.1;
            info.currentActivityThreshold = Math.max(Math.min(info.currentActivityThreshold + step, Math.max(lowerLimit, upperLimit)), Math.min(lowerLimit, upperLimit));
            exports.groupInfos[session.guildId] = info;
            return true;
        }
        if (shouldRespond && !isMute) {
            if (isLocked && !isDirectTrigger) {
                info.pendingResponse = true;
                info.messageCount++;
                exports.groupInfos[session.guildId] = info;
                return false;
            }
            if (info.pendingResponse) {
                info.pendingResponse = false;
            }
            info.messageCount = 0;
            info.lastActivityScore = Math.max(0, info.lastActivityScore - COOLDOWN_PENALTY);
            info.lastResponseTime = now;
            const lowerLimit = copyOfConfig.messageActivityScoreLowerLimit;
            const upperLimit = copyOfConfig.messageActivityScoreUpperLimit;
            const step = (upperLimit - lowerLimit) * 0.1;
            info.currentActivityThreshold = Math.max(Math.min(info.currentActivityThreshold + step, Math.max(lowerLimit, upperLimit)), Math.min(lowerLimit, upperLimit));
            exports.groupInfos[session.guildId] = info;
            return true;
        }
        info.messageCount++;
        exports.groupInfos[session.guildId] = info;
        return false;
    });
}
function logistic(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value > 10)
        return 0.99995;
    if (value < -10)
        return 0.00005;
    return 1 / (1 + Math.exp(-value));
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
/**
 * 计算消息新鲜度因子（指数衰减模型）
 */
function calculateFreshnessFactor(timestamps) {
    if (timestamps.length === 0)
        return 0;
    const now = Date.now();
    const lastMessageTime = timestamps[timestamps.length - 1];
    const timeSinceLastMessage = now - lastMessageTime;
    return Math.exp(-timeSinceLastMessage / FRESHNESS_HALF_LIFE);
}
function smoothScore(targetScore, previousScore, previousTimestamp, now) {
    if (!previousTimestamp || previousTimestamp <= 0) {
        return targetScore;
    }
    const elapsed = now - previousTimestamp;
    if (elapsed <= 0) {
        return targetScore;
    }
    const smoothingFactor = 1 - Math.exp(-elapsed / SMOOTHING_WINDOW);
    return (previousScore +
        (targetScore - previousScore) * clamp(smoothingFactor, 0, 1));
}
/**
 * 计算群聊活跃度综合分数
 *
 * 核心思路：
 * 1. 同时观察长/短窗口的消息速率
 * 2. 对突发消息进行额外权重处理
 * 3. 使用平滑函数降低尖峰，减少误触发
 * 4. 引入新鲜度与冷却机制
 */
function calculateActivityScore(timestamps, lastResponseTime, maxMessages, previousScore, previousTimestamp) {
    const now = Date.now();
    if (timestamps.length < 2) {
        const score = smoothScore(0, previousScore, previousTimestamp, now);
        return { score, timestamp: now };
    }
    const recentMessages = timestamps.filter((ts) => now - ts <= RECENT_WINDOW);
    if (recentMessages.length < MIN_RECENT_MESSAGES) {
        const score = smoothScore(0, previousScore, previousTimestamp, now);
        return { score, timestamp: now };
    }
    const sustainedRate = (recentMessages.length / RECENT_WINDOW) * koishi_1.Time.minute;
    const instantMessages = timestamps.filter((ts) => now - ts <= INSTANT_WINDOW);
    const instantRate = (instantMessages.length / INSTANT_WINDOW) * koishi_1.Time.minute;
    const burstMessages = timestamps.filter((ts) => now - ts <= SHORT_BURST_WINDOW);
    const burstRate = (burstMessages.length / SHORT_BURST_WINDOW) * koishi_1.Time.minute;
    const sustainedComponent = logistic((sustainedRate - SUSTAINED_RATE_THRESHOLD) / SUSTAINED_RATE_SCALE);
    const instantComponent = logistic((instantRate - INSTANT_RATE_THRESHOLD) / INSTANT_RATE_SCALE);
    let combinedScore = sustainedComponent * 0.65 + instantComponent * 0.35;
    if (burstRate > BURST_RATE_THRESHOLD) {
        const burstContribution = clamp((burstRate - BURST_RATE_THRESHOLD) / BURST_RATE_SCALE, 0, 1);
        combinedScore += burstContribution * 0.25;
    }
    if (instantMessages.length >= 6) {
        const startIndex = Math.max(timestamps.length - instantMessages.length, 0);
        const relevant = timestamps.slice(startIndex);
        const intervals = [];
        for (let i = 1; i < relevant.length; i++) {
            intervals.push(relevant[i] - relevant[i - 1]);
        }
        if (intervals.length > 0) {
            const averageGap = intervals.reduce((total, value) => total + value, 0) /
                intervals.length;
            const intervalComponent = logistic((koishi_1.Time.second * 12 - averageGap) / (koishi_1.Time.second * 6));
            combinedScore *= 0.7 + 0.3 * intervalComponent;
        }
    }
    const freshnessFactor = calculateFreshnessFactor(timestamps);
    combinedScore *= 0.55 + 0.45 * freshnessFactor;
    if (maxMessages && recentMessages.length >= maxMessages * 0.9) {
        combinedScore += 0.08;
    }
    if (lastResponseTime) {
        const timeSinceLastResponse = now - lastResponseTime;
        if (timeSinceLastResponse < MIN_COOLDOWN_TIME) {
            const cooldownRatio = timeSinceLastResponse / MIN_COOLDOWN_TIME;
            combinedScore *= cooldownRatio * cooldownRatio;
        }
    }
    const smoothedScore = smoothScore(clamp(combinedScore, 0, 1), previousScore, previousTimestamp, now);
    return { score: clamp(smoothedScore, 0, 1), timestamp: now };
}
