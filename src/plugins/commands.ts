import { Context, Session } from "koishi";
import { Config } from "..";
import { groupInfos } from "./filter";

export function apply(ctx: Context, config: Config) {
  ctx.command("chatluna.character", "角色配置相关命令");

  ctx
    .command("chatluna.character.clear [group]", "清除群组消息记录", {
      authority: 3,
    })
    .action(async ({ session }, group) => {
      const groupId = group ?? session.guildId;
      if (!groupId) {
        const message = "请检查是否提供了群组 id";
        return message;
      }

      const groupInfo = groupInfos[groupId];
      if (!groupInfo) {
        const message = "未找到该群组的消息记录";
        return message;
      }

      groupInfos[groupId] = {
        messageCount: 0,
        messageTimestamps: [],
        lastActivityScore: 0,
        currentActivityThreshold: 0,
        pendingResponse: false,
        lastUserMessageTime: 0,
        lastScoreUpdate: Date.now(),
        lastResponseTime: 0,
      };

      let resultText = `已清除群组 ${groupId} 的消息记录`;
      try {
        await ctx.chatluna_character.clear(groupId);
      } catch (e) {
        resultText = `清除群组 ${groupId} 的消息记录失败：${String(e)}`;
      }

      return resultText;
    });
}
