import { Context, Schema } from 'koishi';
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat';
import { GuildConfig } from './types.js';
export declare function apply(ctx: Context, config: Config): void;
export declare const inject: {
    required: string[];
    optional: string[];
};
export declare const inject2: {
    chatluna: {
        required: boolean;
    };
    chatluna_character: {
        required: boolean;
    };
    database: {
        required: boolean;
    };
};
export interface Config extends ChatLunaPlugin.Config {
    model: string;
    maxMessages: number;
    messageInterval: number;
    messageActivityScoreLowerLimit: number;
    messageActivityScoreUpperLimit: number;
    maxTokens: number;
    applyGroup: string[];
    searchKeywordExtraModel: string;
    modelOverride: {
        groupId: string;
        model: string;
    }[];
    configs: Record<string, GuildConfig>;
    defaultPreset: string;
    isNickname: boolean;
    isNickNameWithContent: boolean;
    largeTextSize: number;
    largeTextTypingTime: number;
    markdownRender: boolean;
    toolCalling: boolean;
    isForceMute: boolean;
    sendStickerProbability: number;
    image: boolean;
    imageInputMaxCount: number;
    imageInputMaxSize: number;
    modelCompletionCount: number;
    coolDownTime: number;
    typingTime: number;
    muteTime: number;
    disableChatLuna: boolean;
    whiteListDisableChatLuna: string[];
    splitSentence: boolean;
    isAt: boolean;
    respondEveryMessage: boolean;
}
export declare const Config: Schema<Config>;
export declare const name = "chatluna-character";
