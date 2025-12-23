import axios, { AxiosRequestConfig } from 'axios'
import type PQueue from 'p-queue'
import type { LogLevel } from './Logger'

const DISCORD_LIMIT = 2000

export interface DiscordConfig {
    enabled?: boolean
    url: string
}

let discordQueue: PQueue | null = null

async function getDiscordQueue(): Promise<PQueue> {
    if (!discordQueue) {
        const { default: PQueueCtor } = await import('p-queue')
        discordQueue = new PQueueCtor({
            interval: 1000,
            intervalCap: 2,
            carryoverConcurrencyCount: true
        })
    }
    return discordQueue
}

function truncate(text: string) {
    return text.length <= DISCORD_LIMIT ? text : text.slice(0, DISCORD_LIMIT - 14) + ' …(truncated)'
}

export async function sendDiscord(discordUrl: string, content: string, level: LogLevel): Promise<void> {
    if (!discordUrl) return

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: discordUrl,
        headers: { 'Content-Type': 'application/json' },
        data: { content: truncate(content), allowed_mentions: { parse: [] } },
        timeout: 10000
    }

    const q = await getDiscordQueue()
    await q.add(async () => {
        try {
            await axios(request)
        } catch (err: any) {
            const status = err?.response?.status
            if (status === 429) return
        }
    })
}

export async function flushDiscordQueue(timeoutMs = 5000): Promise<void> {
    await Promise.race([
        (async () => {
            const q = await getDiscordQueue()
            await q.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('discord flush timeout')), timeoutMs))
    ]).catch(() => {})
}
