// eslint-disable-next-line @typescript-eslint/no-unused-vars
import EventEmitter from 'events'
import { Context, h, Logger, Service, Session } from 'koishi'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { Config } from '..'
import { Preset } from '../preset'
import { GroupTemp, Message } from '../types'
import { StickerService } from './sticker'
import { isMessageContentImageUrl } from 'koishi-plugin-chatluna/utils/string'

let logger: Logger

export class MessageCollector extends Service {
  private _messages: Record<string, Message[]> = {}

  // 标记每个群组是否已经有持久化的历史记录
  private _hasHistory: Record<string, boolean> = {}

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
    logger = this.logger
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
      logger.debug(
        `开始清理群组 ${groupId} 的消息历史和上下文`
      )
      this._messages[groupId] = []
      // 清理该群组的临时上下文和历史标记
      delete this._groupTemp[groupId]
      this._hasHistory[groupId] = false
      await this.ctx.database.remove('chatluna_character.history', {
        groupId
      })
      logger.debug(
        `已完成清理群组 ${groupId} 的消息历史和上下文`
      )
    } else {
      logger.debug('开始清理所有群组的消息历史和上下文')
      this._messages = {}
      // 全量清理时，同步重置上下文和历史标记
      this._groupTemp = {}
      this._hasHistory = {}
      await this.ctx.database.remove('chatluna_character.history', {})
      logger.debug('已完成清理所有群组的消息历史和上下文')
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

    this._messages[groupId] = groupArray

    // 机器人发送的消息只会出现在已经建立会话历史的群组中
    // 若还未标记为已有历史，则在此处补充标记，确保状态一致
    if (!this._hasHistory[groupId]) {
      this._hasHistory[groupId] = true
    }

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

    this._messages[groupId] = groupArray

    const shouldRespond =
      this._filters.some((func) => func(session, message)) &&
      !this.isMute(session)

    const hasHistory = this._hasHistory[groupId] === true

    // 对于已经有历史记录的群组，保持原有行为：每条消息都写入数据库
    if (hasHistory) {
      await this._saveGroupToDatabase(groupId)
    }

    if (!shouldRespond) {
      if (!hasHistory) {
        logger.debug(
          `群组 ${groupId} 尚无历史记录，本次消息仅暂存于内存，当前条数：${groupArray.length}`
        )
      }
      await this._unlock(session)
      return this.isMute(session)
    }

    // 只有在需要回复且还没有历史记录时，才将当前内存中的消息作为新一轮历史一次性写入数据库
    if (!hasHistory) {
      logger.debug(
        `群组 ${groupId} 首次在清理后触发回复，将使用清理后的 ${groupArray.length} 条消息作为上下文并写入数据库`
      )
      await this._saveGroupToDatabase(groupId)
      this._hasHistory[groupId] = true
    }

    this.setResponseLock(session)
    this._eventEmitter.emit('collect', session, groupArray)
    await this._unlock(session)
    return true
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
      logger.debug('开始从数据库加载历史消息')
      const rows = await this.ctx.database.get(
        'chatluna_character.history',
        {},
        ['groupId', 'payload']
      )

      const maxMessageSize = this._config.maxMessages
      logger.debug(
        `读取到 ${rows.length} 个群组历史记录`
      )

      for (const row of rows) {
        try {
          let groupArray = JSON.parse(row.payload) as Message[]

          if (!Array.isArray(groupArray)) continue

          while (groupArray.length > maxMessageSize) {
            groupArray.shift()
          }

          this._messages[row.groupId] = groupArray
          // 从数据库加载出的群组历史，标记为已有历史记录
          this._hasHistory[row.groupId] = true
          logger.debug(
            `[chatluna-character] 群组 ${row.groupId} 历史消息已加载，条数：${groupArray.length}`
          )
        } catch (e) {
          logger.warn(
            `[chatluna-character] 解析群组 ${row.groupId} 历史消息失败，已跳过：`,
            e
          )
        }
      }
    } catch (e) {
      logger.warn(
        '从数据库加载历史消息失败，已回退为空历史：',
        e
      )
      this._messages = {}
    }
  }

  private async _saveGroupToDatabase(groupId: string) {
    try {
      const groupArray = this._messages[groupId] ?? []

      // 为了避免在数据库中存储体积巨大的 base64 图片数据，
      // 持久化时会过滤掉所有以 data:image/...;base64, 开头的图片地址。
      // 这样可以在内存中继续保留完整图片信息供多模态模型使用，
      // 但数据库中只保存精简后的文本和非 base64 图片元数据。
      const sanitizedGroupArray = groupArray.map((message) => {
        const cloned: Message = { ...message }

        if (cloned.images && cloned.images.length > 0) {
          const filteredImages = cloned.images.filter((image) => {
            if (!image?.url) return false
            // 过滤掉 base64 图片地址
            return !/^data:image\/[a-z]+;base64,/i.test(image.url)
          })

          if (filteredImages.length > 0) {
            cloned.images = filteredImages
          } else {
            delete cloned.images
          }
        }

        return cloned
      })

      await this.ctx.database.upsert('chatluna_character.history', [
        {
          groupId,
          payload: JSON.stringify(sanitizedGroupArray)
        }
      ])
    } catch (e) {
      logger.warn(
        `保存群组 ${groupId} 历史消息到数据库失败：`,
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
