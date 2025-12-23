import axios, { AxiosRequestConfig } from 'axios'
import type PQueue from 'p-queue'
import type { WebhookNtfyConfig } from '../interface/Config'
import type { LogLevel } from './Logger'

let ntfyQueue: PQueue | null = null

async function getNtfyQueue(): Promise<PQueue> {
    if (!ntfyQueue) {
        const { default: PQueueCtor } = await import('p-queue')
        ntfyQueue = new PQueueCtor({
            interval: 1000,
            intervalCap: 2,
            carryoverConcurrencyCount: true
        })
    }
    return ntfyQueue
}

export async function sendNtfy(config: WebhookNtfyConfig, content: string, level: LogLevel): Promise<void> {
    if (!config?.url) return

    switch (level) {
        case 'error':
            config.priority = 5 // Highest
            break

        case 'warn':
            config.priority = 4
            break

        default:
            break
    }

    const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
    if (config.title) headers['Title'] = config.title
    if (config.tags?.length) headers['Tags'] = config.tags.join(',')
    if (config.priority) headers['Priority'] = String(config.priority)
    if (config.token) headers['Authorization'] = `Bearer ${config.token}`

    const url = config.topic ? `${config.url}/${config.topic}` : config.url

    const request: AxiosRequestConfig = {
        method: 'POST',
        url: url,
        headers,
        data: content,
        timeout: 10000
    }

    const q = await getNtfyQueue()
    await q.add(async () => {
        try {
            await axios(request)
        } catch (err: any) {
            const status = err?.response?.status
            if (status === 429) return
        }
    })
}

export async function flushNtfyQueue(timeoutMs = 5000): Promise<void> {
    await Promise.race([
        (async () => {
            const q = await getNtfyQueue()
            await q.onIdle()
        })(),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('ntfy flush timeout')), timeoutMs))
    ]).catch(() => {})
}
