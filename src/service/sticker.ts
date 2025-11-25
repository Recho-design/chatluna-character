import { Context, h } from 'koishi'
import path from 'path'
import fs, { readFile } from 'fs/promises'
import { Config } from '..'

export class StickerService {
    private _stickers: Record<string, string[]> = {}

    constructor(
        private _ctx: Context,
        private _config: Config
    ) {}

    async init() {
        const sickerDir = path.resolve(
            this._ctx.baseDir,
            'data/chathub/character/sticker'
        )

        // check if the dir exists

        try {
            await fs.access(sickerDir)
        } catch (error) {
            // copy the resource dir to the target dir
            await fs.mkdir(sickerDir, { recursive: true })
            const dirname = __dirname
            await fs.cp(
                path.resolve(dirname, '../resources/sticker'),
                sickerDir,
                {
                    recursive: true
                }
            )
        }

        // read the dir

        const dirs = await fs.readdir(sickerDir)

        for (const dirName of dirs) {
            const dir = path.resolve(sickerDir, dirName)

            const stats = await fs.stat(dir)

            if (stats.isDirectory()) {
                const stickers = await fs.readdir(dir)
                this._stickers[dirName] = stickers.map((sticker) =>
                    path.resolve(dir, sticker)
                )
            }
        }

        const availableTypes = Object.keys(this._stickers)
        if (availableTypes.length === 0) {
            this._ctx.logger.info(
                '当前未检测到可用表情包类型，请检查 data/chathub/character/sticker 目录'
            )
        } else {
            this._ctx.logger.info(
                `可用表情包类型：${availableTypes.join(', ')}`
            )
        }

        if (Object.keys(this._stickers).length > 0) {
            this._ctx.logger.warn(
                'Sticker Service is deprecated. In future, we will make the new sticker system.'
            )
        }
    }

    getAllStickTypes() {
        return Object.keys(this._stickers)
    }

    async randomStickByType(type: string) {
        const allStickers = this._stickers[type]

        if (!allStickers) {
            return this.randomStick()
        }

        // random a sticker
        const index = Math.floor(Math.random() * allStickers.length)
        const sticker = allStickers[index]

        if (!sticker) {
            return undefined
        }

        this._ctx.root.chatluna_character.logger.debug(
            `send sticker: ${sticker}`
        )

        return h.image(await readFile(sticker), `image/${getFileType(sticker)}`)
    }

    async randomStick(): Promise<h> {
        const allStickers = Object.values(this._stickers).flat()
        // random a sticker
        const index = Math.floor(Math.random() * allStickers.length)
        const sticker = allStickers[index]

        if (!sticker) {
            return undefined
        }

        this._ctx.root.chatluna_character.logger.debug(
            `send sticker: ${sticker}`
        )

        return h.image(await readFile(sticker), `image/${getFileType(sticker)}`)
    }
}

function getFileType(path: string) {
    const type = path.split('.').pop().toLocaleLowerCase()
    if (type === 'jpg') {
        return 'jpeg'
    }
    return type
}
