import { Context } from 'koishi'
import { Config } from '.'
// import start
import { apply as chat } from './plugins/chat.js'
import { apply as commands } from './plugins/commands.js'
import { apply as config } from './plugins/config.js'
import { apply as filter } from './plugins/filter.js'
import { apply as interception } from './plugins/interception.js' // import end

export async function plugins(ctx: Context, parent: Config) {
    type Command = (ctx: Context, config: Config) => PromiseLike<void> | void

    const middlewares: Command[] =
        // middleware start
        [chat, commands, config, filter, interception] // middleware end

    for (const middleware of middlewares) {
        await middleware(ctx, parent)
    }
}
