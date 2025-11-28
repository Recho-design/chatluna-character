import { Context, h, Logger, Service, Session } from 'koishi';
import { Config } from '..';
import { Preset } from '../preset';
import { GroupTemp, Message } from '../types';
import { StickerService } from './sticker';
export declare class MessageCollector extends Service {
    readonly ctx: Context;
    _config: Config;
    private _messages;
    private _hasHistory;
    private _eventEmitter;
    private _filters;
    private _groupLocks;
    private _groupTemp;
    stickerService: StickerService;
    preset: Preset;
    logger: Logger;
    constructor(ctx: Context, _config: Config);
    addFilter(filter: MessageCollectorFilter): void;
    mute(session: Session, time: number): void;
    collect(func: (session: Session, messages: Message[]) => Promise<void>): void;
    getMessages(groupId: string): Message[];
    isMute(session: Session): boolean;
    isResponseLocked(session: Session): boolean;
    setResponseLock(session: Session): void;
    releaseResponseLock(session: Session): void;
    updateTemp(session: Session, temp: GroupTemp): Promise<void>;
    getTemp(session: Session): Promise<GroupTemp>;
    private _getGroupLocks;
    private _getGroupConfig;
    private _lock;
    private _unlock;
    clear(groupId?: string): Promise<void>;
    broadcastOnBot(session: Session, elements: h[] | h[][]): Promise<void>;
    broadcast(session: Session): Promise<boolean>;
    private _processImages;
    private _getImageSize;
    private _loadFromDatabase;
    private _saveGroupToDatabase;
}
type MessageCollectorFilter = (session: Session, message: Message) => boolean;
declare module 'koishi' {
    interface Context {
        chatluna_character: MessageCollector;
    }
    interface Tables {
        'chatluna_character.history': ChatlunaCharacterHistory;
    }
}
export interface ChatlunaCharacterHistory {
    groupId: string;
    payload: string;
}
export declare function getNotEmptyString(...texts: (string | undefined)[]): string;
export {};
