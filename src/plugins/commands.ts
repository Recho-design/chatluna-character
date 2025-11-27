import { Context, Session } from "koishi";
import { Config } from "..";
import { groupInfos } from "./filter.js";

export function apply(ctx: Context, config: Config) {
  ctx.command("chatluna.character", "角色配置相关命令");

  ctx
    .command("chatluna.character.clear [group]", "清除群组消息记录", {
      authority: 3,
    })
    .action(async ({ session }, group) => {
      // 先在 3 秒内回复“正在清理…”，避免超时
      const ackIds = await ackInteraction(
        session,
        "已收到清除请求，正在清理群组消息记录…"
      );

      const groupId = group ?? session.guildId;
      if (!groupId) {
        await sendMessageToPrivate(session, "请检查是否提供了群组 id");
        return;
      }

      const groupInfo = groupInfos[groupId];
      if (!groupInfo) {
        await sendMessageToPrivate(session, "未找到该群组的消息记录");
        return;
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
        // 这里清理可能会很慢
        await ctx.chatluna_character.clear(groupId);
      } catch (e) {
        resultText = `清除群组 ${groupId} 的消息记录失败：${String(e)}`;
      }

      // 如果是 Discord 斜杠命令，就编辑刚才那条“正在清理中”的消息
      if (
        session.platform === "discord" &&
        session.subtype?.startsWith("interaction") &&
        session.channelId &&
        ackIds?.length
      ) {
        await (session.bot as any).editMessage(
          session.channelId,
          ackIds[0],
          resultText
        );
      } else {
        // 其他平台保持原来的私聊反馈
        await sendMessageToPrivate(session, resultText);
      }
    });
}

async function sendMessageToPrivate(session: Session, message: string) {
  await session.bot.sendPrivateMessage(session.userId, message);
}

async function ackInteraction(
  session: Session,
  message: string
): Promise<string[]> {
  // Discord 斜线命令需要在 3 秒内响应一次，避免前端一直显示“正在响应”
  if (
    session.platform === "discord" &&
    session.subtype?.startsWith("interaction")
  ) {
    // 返回这次发送的消息 id
    return session.send(message);
  }
}
