"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugins = plugins;
// import start
const chat_js_1 = require("./plugins/chat.js");
const commands_js_1 = require("./plugins/commands.js");
const config_js_1 = require("./plugins/config.js");
const filter_js_1 = require("./plugins/filter.js");
const interception_js_1 = require("./plugins/interception.js"); // import end
async function plugins(ctx, parent) {
    const middlewares = 
    // middleware start
    [chat_js_1.apply, commands_js_1.apply, config_js_1.apply, filter_js_1.apply, interception_js_1.apply]; // middleware end
    for (const middleware of middlewares) {
        await middleware(ctx, parent);
    }
}
