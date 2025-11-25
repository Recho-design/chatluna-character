"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = apply;
const filter_js_1 = require("./filter.js");
function apply(ctx, config) {
    ctx.command('chatluna.character', '角色扮演相关命令');
    ctx.command('chatluna.character.clear [group]', '清除群组的聊天记录', {
        authority: 3
    }).action(async ({ session }, group) => {
        const groupId = group ?? session.guildId;
        if (!groupId) {
            await sendMessageToPrivate(session, '请检查你是否提供了群组 id');
            return;
        }
        const groupInfo = filter_js_1.groupInfos[groupId];
        if (!groupInfo) {
            await sendMessageToPrivate(session, '未找到该群组的聊天记录');
            return;
        }
        filter_js_1.groupInfos[groupId] = {
            messageCount: 0,
            messageTimestamps: [],
            lastActivityScore: 0,
            currentActivityThreshold: 0,
            pendingResponse: false,
            lastUserMessageTime: 0,
            lastScoreUpdate: Date.now(),
            lastResponseTime: 0
        };
        ctx.chatluna_character.clear(groupId);
        await sendMessageToPrivate(session, `已清除群组 ${groupId} 的聊天记录`);
    });
}
async function sendMessageToPrivate(session, message) {
    await session.bot.sendPrivateMessage(session.userId, message);
}
