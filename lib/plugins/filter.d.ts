import { Context } from 'koishi';
import { Config } from '..';
import { GroupInfo } from '../types.js';
export declare const groupInfos: Record<string, GroupInfo>;
export declare function apply(ctx: Context, config: Config): Promise<void>;
