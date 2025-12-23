import type { AxiosRequestConfig } from 'axios'
import type {
    BingSuggestionResponse,
    BingTrendingTopicsResponse,
    GoogleSearch,
    GoogleTrendsResponse
} from '../interface/Search'
import type { MicrosoftRewardsBot } from '../index'

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) {}

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []
        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-GOOGLE-TRENDS',
            `正在生成搜索词，可能需要较长时间 | 地区: ${geoLocale}`
        )

        const localeUpper = (geoLocale || '').toUpperCase()
        const preferDomestic = localeUpper === 'CN'
        if (preferDomestic) {
            this.bot.logger.info(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '检测到中国地区，改用国内热词源')
            const domestic = await this.getDomesticHotQueries()
            if (domestic.length > 0) {
                return domestic
            }
            this.bot.logger.warn(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '国内热词源为空，继续尝试 Google Trends')
        }

        try {
            const request: AxiosRequestConfig = {
                url: 'https://trends.google.com/_/TrendsUi/data/batchexecute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[i0OFE,"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData = response.data

            const trendsData = this.extractJsonFromResponse(rawData)
            if (!trendsData) {
                this.bot.logger.error(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '解析 Google 趋势响应失败')
                const domestic = await this.getDomesticHotQueries()
                if (domestic.length > 0) {
                    this.bot.logger.warn(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'Google Trends 不可用，已回退至国内热词源')
                    return domestic
                }
                throw new Error('解析 Google 趋势响应失败')
            }

            const mappedTrendsData = trendsData.map(query => [query[0], query[9]!.slice(1)])
            if (mappedTrendsData.length < 90) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-GOOGLE-TRENDS',
                    '搜索词不足，回退至美国地区（US）'
                )
                return this.getGoogleTrends('US')
            }

            for (const [topic, relatedQueries] of mappedTrendsData) {
                queryTerms.push({
                    topic: topic as string,
                    related: relatedQueries as string[]
                })
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
            const domestic = await this.getDomesticHotQueries()
            if (domestic.length > 0) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', '请求失败，已回退至国内热词源')
                return domestic
            }
        }

        const queries = queryTerms.flatMap(x => [x.topic, ...x.related])

        return queries
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        const lines = text.split('\n')
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    return JSON.parse(JSON.parse(trimmed)[0][2])[1]
                } catch {
                    continue
                }
            }
        }

        return null
    }

    private async getDomesticHotQueries(): Promise<string[]> {
        const sources: Array<() => Promise<string[]>> = [
            () => this.getToutiaoHotBoard()
        ]

        const buckets: string[][] = []

        for (const source of sources) {
            try {
                const list = await source()
                if (list.length) buckets.push(list)
            } catch {
                // 已在每个源内记录日志
            }
        }

        let merged = buckets.flat()
        merged = merged.map(q => q.trim()).filter(q => q.length > 0)
        merged = [...new Set(merged)]

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-DOMESTIC-HOT',
            `国内热词源汇总 | 源数=${buckets.length} | 关键词数=${merged.length}`
        )

        // 结果过少时补充 Bing 热门话题
        if (merged.length < 30) {
            const bingTopics = await this.getBingTendingTopics('zh-CN').catch(() => [])
            const mergedWithBing = [...new Set([...merged, ...bingTopics])]
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-DOMESTIC-HOT',
                `补充 Bing 热门话题 | 增量=${mergedWithBing.length - merged.length}`
            )
            merged = mergedWithBing
        }

        // 随机打乱
        merged = this.bot.utils.shuffleArray(merged)

        return merged
    }

    private async getToutiaoHotBoard(): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.toutiao.com/'
                }
            }
            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const data = (response.data ?? {}) as Record<string, unknown>
            const items = (data['data'] ?? []) as Array<Record<string, unknown>>
            const titles = items
                .map(item => {
                    const t = (item['Title'] ?? item['title'] ?? '') as string
                    const ev = (item['event'] ?? {}) as Record<string, unknown>
                    const et = (ev['title'] ?? ev['event_title'] ?? '') as string
                    return String(t || et).trim()
                })
                .filter(Boolean)

            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-TOUTIAO-HOT',
                `解析成功 | 数量=${titles.length}`
            )
            return titles
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'SEARCH-TOUTIAO-HOT',
                `获取失败：${error instanceof Error ? error.message : String(error)}`
            )
            return []
        }
    }

    async getBingSuggestions(query: string = '', langCode: string = 'en'): Promise<string[]> {
        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-BING-SUGGESTIONS',
            `正在生成 Bing 建议 | 语言代码: ${langCode}`
        )

        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bingapis.com/api/v7/suggestions?q=${encodeURIComponent(query)}&appid=6D0A9B8C5100E9ECC7E11A104ADD76C10219804B&cc=xl&setlang=${langCode}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData: BingSuggestionResponse = response.data

            const searchSuggestions = rawData.suggestionGroups[0]?.searchSuggestions

            if (!searchSuggestions?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-SUGGESTIONS', 'API 未返回结果')
                return []
            }

            return searchSuggestions.map(x => x.query)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }

    async getBingRelatedTerms(term: string): Promise<string[]> {
        try {
            const request = {
                url: `https://api.bing.com/osjson.aspx?query=${term}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData = response.data

            const relatedTerms = rawData[1]

            if (!relatedTerms?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-RELATED', 'API 未返回结果')
                return []
            }

            return relatedTerms
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }

    async getBingTendingTopics(langCode: string = 'en'): Promise<string[]> {
        try {
            const request = {
                url: `https://www.bing.com/api/v7/news/trendingtopics?appid=91B36E34F9D1B900E54E85A77CF11FB3BE5279E6&cc=xl&setlang=${langCode}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy.queryEngine)
            const rawData: BingTrendingTopicsResponse = response.data

            const trendingTopics = rawData.value

            if (!trendingTopics?.length) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-BING-TRENDING', 'API 未返回结果')
                return []
            }

            const queries = trendingTopics.map(x => x.query?.text?.trim() || x.name.trim())

            return queries
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-BING-TRENDING',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
        }

        return []
    }
}
