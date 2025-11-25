// eslint-disable-next-line @typescript-eslint/no-unused-vars
import EventEmitter from 'events'
import { Context, h, Logger, Service, Session, Time } from 'koishi'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { Config } from '..'
import { Preset } from '../preset.js'
import { GroupTemp, Message } from '../types.js'
import { StickerService } from './sticker.js'
import { isMessageContentImageUrl } from 'koishi-plugin-chatluna/utils/string'

export class MessageCollector extends Service {
    private _messages: Record<string, Message[]> = {}

    private _eventEmitter = new EventEmitter()

    private _filters: MessageCollectorFilter[] = []

    private _groupLocks: Record<string, GroupLock> = {}

    private _groupTemp: Record<string, GroupTemp> = {}

    stickerService: StickerService

    preset: Preset

    declare logger: Logger

    constructor(
        public readonly ctx: Context,
        public _config: Config
    ) {
        super(ctx, 'chatluna_character')
        this.stickerService = new StickerService(ctx, _config)
        this.logger = createLogger(ctx, 'chatluna-character')
        this.preset = new Preset(ctx)

        this.ctx.model.extend(
            'chatluna_character.history',
            {
                groupId: 'string(63)',
                payload: 'text'
            },
            {
                primary: ['groupId']
            }
        )

        // 异步从数据库中加载历史记录
        void this._loadFromDatabase()
    }

    addFilter(filter: MessageCollectorFilter) {
        this._filters.push(filter)
    }

    mute(session: Session, time: number) {
        const lock = this._getGroupLocks(session.guildId)
        let mute = lock.mute ?? 0
        if (mute < new Date().getTime()) {
            mute = new Date().getTime() + time
        } else {
            mute = mute + time
        }
        lock.mute = mute
    }

    collect(func: (session: Session, messages: Message[]) => Promise<void>) {
        this._eventEmitter.on('collect', func)
    }

    getMessages(groupId: string) {
        return this._messages[groupId]
    }

    isMute(session: Session) {
        const lock = this._getGroupLocks(session.guildId)

        return lock.mute > new Date().getTime()
    }

    isResponseLocked(session: Session) {
        const lock = this._getGroupLocks(session.guildId)
        return lock.responseLock
    }

    setResponseLock(session: Session) {
        const lock = this._getGroupLocks(session.guildId)
        lock.responseLock = true
    }

    releaseResponseLock(session: Session) {
        const lock = this._getGroupLocks(session.guildId)
        lock.responseLock = false
    }

    async updateTemp(session: Session, temp: GroupTemp) {
        await this._lock(session)

        const groupId = session.guildId

        this._groupTemp[groupId] = temp

        await this._unlock(session)
    }

    async getTemp(session: Session): Promise<GroupTemp> {
        await this._lock(session)

        const groupId = session.guildId

        const temp = this._groupTemp[groupId] ?? {
            completionMessages: []
        }

        this._groupTemp[groupId] = temp

        await this._unlock(session)

        return temp
    }

    private _getGroupLocks(groupId: string) {
        if (!this._groupLocks[groupId]) {
            this._groupLocks[groupId] = {
                lock: false,
                mute: 0,
                responseLock: false
            }
        }
        return this._groupLocks[groupId]
    }

    private _getGroupConfig(groupId: string) {
        const config = this._config
        if (!config.configs[groupId]) {
            return config
        }
        return Object.assign({}, config, config.configs[groupId])
    }

    private _lock(session: Session) {
        const groupLock = this._getGroupLocks(session.guildId)
        return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (!groupLock.lock) {
                    groupLock.lock = true
                    clearInterval(interval)
                    resolve()
                }
            }, 100)
        })
    }

    private _unlock(session: Session) {
        const groupLock = this._getGroupLocks(session.guildId)
        return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (groupLock.lock) {
                    groupLock.lock = false
                    clearInterval(interval)
                    resolve()
                }
            }, 100)
        })
    }

    async clear(groupId?: string) {
        if (groupId) {
            this._messages[groupId] = []
            await this.ctx.database.remove('chatluna_character.history', {
                groupId
            })
        } else {
            this._messages = {}
            await this.ctx.database.remove('chatluna_character.history', {})
        }
    }

    async broadcastOnBot(session: Session, elements: h[] | h[][]) {
        if (session.isDirect) {
            return
        }

        await this._lock(session)

        const groupId = session.guildId
        const maxMessageSize = this._config.maxMessages
        const groupArray = this._messages[groupId] ? this._messages[groupId] : []

        const segments = Array.isArray(elements[0])
            ? (elements as h[][]).map((segment) =>
                  mapElementToString(session, session.content, segment)
              )
            : [
                  mapElementToString(
                      session,
                      session.content,
                      elements as h[]
                  )
              ]

        const content = segments.filter((text) => text.length > 0).join(',')

        if (content.length < 1) {
            await this._unlock(session)
            return
        }

        // 使用预设名作为 bot 名称前缀，优先使用分群配置的 preset，没有则使用全局默认预设
        const groupConfig = this._config.configs[groupId]
        const presetName = groupConfig?.preset ?? this._config.defaultPreset

        let botName = session.bot.user.name
        const botId = ''

        if (presetName) {
            const preset = this.preset.getPresetForCache(presetName, false)
            if (preset) {
                botName = preset.name
            }
        }

        const message: Message = {
            content,
            name: botName,
            id: botId
        }

        groupArray.push(message)

        while (groupArray.length > maxMessageSize) {
            groupArray.shift()
        }

        const segmentPreview = segments
            .filter((text) => text.length > 0)
            .map((text, index) => `段${index + 1}: ${text}`)
            .join(' || ')
        console.log(
            `[chatluna-character] 机器人消息格式化完成（群组 ${groupId}），${segments.length > 1 ? '多段合并' : '单段'}结果：${segmentPreview}`
        )
        this._messages[groupId] = groupArray
        await this._saveGroupToDatabase(groupId)

        await this._unlock(session)
    }

    async broadcast(session: Session) {
        if (session.isDirect) {
            return
        }

        await this._lock(session)

        const groupId = session.guildId
        const maxMessageSize = this._config.maxMessages
        let groupArray = this._messages[groupId] ? this._messages[groupId] : []

        const config = this._getGroupConfig(groupId)

        const images = config.image
            ? await getImages(this.ctx, config.model, session)
            : undefined

        const elements = session.elements
            ? session.elements
            : [h.text(session.content)]

        const content = mapElementToString(session, session.content, elements)

        if (content.length < 1) {
            await this._unlock(session)
            return
        }

        const message: Message = {
            content,
            name: getNotEmptyString(
                session.author?.nick,
                session.author?.name,
                session.event.user?.name,
                session.username
            ),
            id: session.author.id,
            quote: session.quote
                ? {
                      content: mapElementToString(
                          session,
                          session.quote.content,
                          session.quote.elements ?? [
                              h.text(session.quote.content)
                          ]
                      ),
                      name: session.quote?.user?.name,
                      id: session.quote?.user?.id
                  }
                : undefined,
            images
        }

        groupArray.push(message)

        while (groupArray.length > maxMessageSize) {
            groupArray.shift()
        }

        await this._processImages(groupArray, config)

        console.log(
            `[chatluna-character] 用户消息格式化完成（群组 ${groupId}）：${content}`
        )
        this._messages[groupId] = groupArray
        await this._saveGroupToDatabase(groupId)

        if (
            this._filters.some((func) => func(session, message)) &&
            !this.isMute(session)
        ) {
            this.setResponseLock(session)
            this._eventEmitter.emit('collect', session, groupArray)
            await this._unlock(session)
            return true
        } else {
            await this._unlock(session)
            return this.isMute(session)
        }
    }

    private async _processImages(groupArray: Message[], config: Config) {
        if (!config.image) return

        const maxCount = config.imageInputMaxCount || 3
        const maxSize =
            config.imageInputMaxSize * 1024 * 1024 || 1024 * 1024 * 10

        let currentCount = 0
        let currentSize = 0

        for (let i = groupArray.length - 1; i >= 0; i--) {
            const message = groupArray[i]
            if (!message.images || message.images.length === 0) continue

            const validImages: Awaited<ReturnType<typeof getImages>> = []

            for (const image of message.images) {
                const imageSize = await this._getImageSize(image.url)

                if (
                    currentCount < maxCount &&
                    currentSize + imageSize <= maxSize
                ) {
                    validImages.push(image)
                    currentCount++
                    currentSize += imageSize
                } else {
                    break
                }
            }

            if (validImages.length === 0) {
                delete message.images
            } else {
                message.images = validImages
            }

            if (currentCount >= maxCount || currentSize >= maxSize) {
                for (let j = i - 1; j >= 0; j--) {
                    if (groupArray[j].images) {
                        delete groupArray[j].images
                    }
                }
                break
            }
        }
    }

    private async _getImageSize(base64Image: string): Promise<number> {
        if (!base64Image.startsWith('data:')) {
            const resp = await this.ctx.http.get(base64Image, {
                responseType: 'arraybuffer'
            })
            return resp.byteLength
        }
        try {
            const base64Data = base64Image.replace(
                /^data:image\/[a-z]+;base64,/,
                ''
            )
            return Math.ceil((base64Data.length * 3) / 4)
        } catch {
            return 0
        }
    }

    private async _loadFromDatabase() {
        try {
            console.log('[chatluna-character] 开始从数据库加载历史消息')
            const rows = await this.ctx.database.get(
                'chatluna_character.history',
                {},
                ['groupId', 'payload']
            )

            const maxMessageSize = this._config.maxMessages
            console.log(
                `[chatluna-character] 读取到 ${rows.length} 个群组历史记录`
            )

            for (const row of rows) {
                try {
                    let groupArray = JSON.parse(row.payload) as Message[]

                    if (!Array.isArray(groupArray)) continue

                    while (groupArray.length > maxMessageSize) {
                        groupArray.shift()
                    }

                    this._messages[row.groupId] = groupArray
                    console.log(
                        `[chatluna-character] 群组 ${row.groupId} 历史消息已加载，条数：${groupArray.length}`
                    )
                } catch (e) {
                    console.warn(
                        `[chatluna-character] 解析群组 ${row.groupId} 历史消息失败，已跳过：`,
                        e
                    )
                }
            }
        } catch (e) {
            console.warn(
                '[chatluna-character] 从数据库加载历史消息失败，已回退为空历史：',
                e
            )
            this._messages = {}
        }
    }

    private async _saveGroupToDatabase(groupId: string) {
        try {
            const groupArray = this._messages[groupId] ?? []

            console.log(
                `[chatluna-character] 正在保存群组 ${groupId} 历史消息到数据库，条数：${groupArray.length}`
            )
            await this.ctx.database.upsert('chatluna_character.history', [
                {
                    groupId,
                    payload: JSON.stringify(groupArray)
                }
            ])
        } catch (e) {
            console.warn(
                `[chatluna-character] 保存群组 ${groupId} 历史消息到数据库失败：`,
                e
            )
        }
    }
}

function mapElementToString(session: Session, content: string, elements: h[]) {
    const filteredBuffer: string[] = []

    for (const element of elements) {
        if (element.type === 'text') {
            const content = element.attrs.content as string

            if (content?.trimEnd()?.length > 0) {
                filteredBuffer.push(content)
            }
        } else if (element.type === 'at') {
            let name = element.attrs?.name
            if (element.attrs.id === session.bot.selfId) {
                name = name ?? session.bot.user.name ?? '0'
            }
            if (name == null || name.length < 1) {
                name = element.attrs.id ?? '0'
            }

            filteredBuffer.push(`<at name='${name}'>${element.attrs.id}</at>`)
        } else if (element.type === 'img') {
            const imageHash = element.attrs.imageHash as string | undefined
            const imageUrl = element.attrs.imageUrl as string | undefined

            if (imageUrl) {
                filteredBuffer.push(`<sticker>${imageUrl}</sticker>`)
            } else {
                filteredBuffer.push(
                    `[image` + imageHash
                        ? `:${imageHash}`
                        : imageUrl
                          ? `:${imageUrl}`
                          : '' + `]`
                )
            }
        } else if (element.type === 'face') {
            filteredBuffer.push(
                `<face name='${element.attrs.name}'>${element.attrs.id}</face>`
            )
        }
    }

    if (content.trimEnd().length < 1 && filteredBuffer.length < 1) {
        return ''
    }

    return filteredBuffer.join('')
}

// 返回 base64 的图片编码
async function getImages(ctx: Context, model: string, session: Session) {
    const mergedMessage = await ctx.chatluna.messageTransformer.transform(
        session,
        session.elements,
        model
    )

    if (typeof mergedMessage.content === 'string') {
        return undefined
    }

    const images = mergedMessage.content.filter(isMessageContentImageUrl)

    if (!images || images.length < 1) {
        return undefined
    }

    return images.map((image) => {
        const url =
            typeof image.image_url === 'string'
                ? image.image_url
                : image.image_url.url

        const hash: string =
            typeof image.image_url !== 'string' ? image.image_url['hash'] : ''

        const formatted = hash ? `[image:${hash}]` : `<sticker>${url}</sticker>`

        return { url, hash, formatted }
    })
}

type MessageCollectorFilter = (session: Session, message: Message) => boolean

interface GroupLock {
    lock: boolean
    mute: number
    responseLock: boolean
}

declare module 'koishi' {
    export interface Context {
        chatluna_character: MessageCollector
    }

    export interface Tables {
        'chatluna_character.history': ChatlunaCharacterHistory
    }
}

export interface ChatlunaCharacterHistory {
    groupId: string
    payload: string
}

export function getNotEmptyString(...texts: (string | undefined)[]): string {
    for (const text of texts) {
        if (text && text?.length > 0) {
            return text
        }
    }
}
