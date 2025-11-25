import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model';
import { Config } from '.';
import { ChatLunaChain, Message } from './types.js';
import { BaseMessage } from '@langchain/core/messages';
import { Context, Element, h, Logger, Session } from 'koishi';
import { ComputedRef } from 'koishi-plugin-chatluna';
export declare function isEmoticonStatement(text: string, elements: Element[]): 'emoji' | 'text' | 'span';
export declare function isOnlyPunctuation(text: string): boolean;
export declare function processElements(elements: Element[], voiceRender?: (element: h) => Promise<h[]>, config?: Config): Promise<Element[][]>;
export declare function processTextMatches(rawMessage: string, useAt?: boolean, markdownRender?: boolean): {
    currentElements: Element[];
    parsedMessage: string;
};
export declare function parseResponse(response: string, useAt?: boolean, voiceRender?: (element: h) => Promise<h[]>, config?: Config): Promise<{
    elements: Element[][];
    rawMessage: string;
    status: string;
    sticker: string;
    messageType: string;
}>;
export declare function splitSentence(text: string): string[];
export declare function matchAt(str: string): {
    at: string;
    start: number;
    end: number;
}[];
export declare function matchPre(str: string): {
    pre: string;
    start: number;
    end: number;
}[];
export declare function formatTimestamp(timestamp: number | Date): string;
export declare function createChatLunaChain(ctx: Context, llmRef: ComputedRef<ChatLunaChatModel>, session: Session): Promise<ComputedRef<ChatLunaChain>>;
export declare function createEmbeddingsModel(ctx: Context): Promise<ComputedRef<import("@langchain/core/embeddings").Embeddings>>;
export declare function formatMessage(messages: Message[], config: Config, model: ChatLunaChatModel, systemPrompt: string, historyPrompt: string): Promise<readonly [string[], string]>;
export declare function formatCompletionMessages(messages: BaseMessage[], tempMessages: BaseMessage[], humanMessage: BaseMessage, config: Config, model: ChatLunaChatModel): Promise<BaseMessage[]>;
export declare function parseXmlToObject(xml: string): {
    name: string;
    id: string;
    type: string;
    sticker: string;
    content: string;
};
export declare function transform(source: string): h[];
export declare function transform(source: TemplateStringsArray, ...args: any[]): h[];
export declare function setLogger(setLogger: Logger): void;
