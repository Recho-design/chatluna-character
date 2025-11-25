"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = apply;
const schema_1 = require("koishi-plugin-chatluna/utils/schema");
async function apply(ctx, config) {
    (0, schema_1.modelSchema)(ctx);
}
