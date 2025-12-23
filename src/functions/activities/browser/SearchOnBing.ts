import type { AxiosRequestConfig } from 'axios'
import type { Page } from 'patchright'
import * as fs from 'fs'
import path from 'path'

import { Workers } from '../../Workers'
import { QueryCore } from '../../QueryEngine'

import type { BasePromotion } from '../../../interface/DashboardData'

export class SearchOnBing extends Workers {
    private bingHome = 'https://bing.com'

    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private success: boolean = false

    private oldBalance: number = this.bot.userData.currentPoints

    public async doSearchOnBing(promotion: BasePromotion, page: Page) {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'SEARCH-ON-BING',
            `开始执行 SearchOnBing | offerId=${offerId} | 标题="${promotion.title}" | 当前积分=${this.oldBalance}`
        )

        try {
            this.cookieHeader = (this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop)
                .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
                .join('; ')

            const fingerprintHeaders = { ...this.bot.fingerprint.headers }
            delete fingerprintHeaders['Cookie']
            delete fingerprintHeaders['cookie']
            this.fingerprintHeader = fingerprintHeaders

            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `已准备请求头 | offerId=${offerId} | Cookie长度=${this.cookieHeader.length} | 指纹头键数=${Object.keys(this.fingerprintHeader).length}`
            )

            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING', `正在激活搜索任务 | offerId=${offerId}`)

            const activated = await this.activateSearchTask(promotion)
            if (!activated) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `无法激活搜索活动，已中止 | offerId=${offerId}`
                )
                return
            }

            // Do the bing search here
            const queries = await this.getSearchQueries(promotion)

            // Run through the queries
            await this.searchBing(page, queries)

            if (this.success) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `SearchOnBing 已完成 | offerId=${offerId} | 初始积分=${this.oldBalance} | 最终积分=${this.bot.userData.currentPoints}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'SEARCH-ON-BING',
                    `SearchOnBing 失败 | offerId=${offerId} | 初始积分=${this.oldBalance} | 最终积分=${this.bot.userData.currentPoints}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING',
                `doSearchOnBing 出错 | offerId=${promotion.offerId} | 信息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async searchBing(page: Page, queries: string[]) {
        queries = [...new Set(queries)]

        this.bot.logger.debug(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `开始搜索循环 | 关键词数量=${queries.length} | 旧积分=${this.oldBalance}`
        )

        let i = 0
        for (const query of queries) {
            try {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `处理关键词 | query="${query}"`)

                await this.bot.mainMobilePage.goto(this.bingHome)

                // Wait until page loaded
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

                await this.bot.browser.utils.tryDismissAllMessages(page)

                const searchBar = '#sb_form_q'

                const searchBox = page.locator(searchBar)
                await searchBox.waitFor({ state: 'attached', timeout: 15000 })

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, searchBar, { clickCount: 3 })
                await searchBox.fill('')

                await page.keyboard.type(query, { delay: 50 })
                await page.keyboard.press('Enter')

                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))

                // Check for point updates
                const newBalance = await this.bot.browser.func.getCurrentPoints()
                this.gainedPoints = newBalance - this.oldBalance

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `查询后积分检查 | 关键词="${query}" | 旧积分=${this.oldBalance} | 新积分=${newBalance} | 获得积分=${this.gainedPoints}`
                )

                if (this.gainedPoints > 0) {
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `SearchOnBing 查询完成 | 关键词="${query}" | 获得积分=${this.gainedPoints} | 旧积分=${this.oldBalance} | 新积分=${newBalance}`,
                        'green'
                    )

                    this.success = true
                    return
                } else {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-SEARCH',
                        `${++i}/${queries.length} | 未获得积分 | 关键词="${query}"`
                    )
                }
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-SEARCH',
                    `搜索循环中出错 | 关键词="${query}" | 信息=${error instanceof Error ? error.message : String(error)}`
                )
            } finally {
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
                await page.goto(this.bot.config.baseURL, { timeout: 5000 }).catch(() => {})
            }
        }

        this.bot.logger.warn(
            this.bot.isMobile,
            'SEARCH-ON-BING-SEARCH',
            `所有关键词完成后仍未获得积分 | 尝试次数=${queries.length} | 旧积分=${this.oldBalance} | 最终积分=${this.bot.userData.currentPoints}`
        )
    }

    // The task needs to be activated before being able to complete it
    private async activateSearchTask(promotion: BasePromotion): Promise<boolean> {
        try {
            this.bot.logger.debug(
                this.bot.isMobile,
                'SEARCH-ON-BING-ACTIVATE',
                `准备激活请求 | offerId=${promotion.offerId} | hash=${promotion.hash}`
            )

            const formData = new URLSearchParams({
                id: promotion.offerId,
                hash: promotion.hash,
                timeZone: '60',
                activityAmount: '1',
                dbs: '0',
                form: '',
                type: '',
                __RequestVerificationToken: this.bot.requestToken
            })

            const request: AxiosRequestConfig = {
                url: 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest',
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: this.cookieHeader,
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                },
                data: formData
            }

            const response = await this.bot.axios.request(request)
            this.bot.logger.info(
                this.bot.isMobile,
                'SEARCH-ON-BING-ACTIVATE',
                `活动激活成功 | 状态=${response.status} | offerId=${promotion.offerId}`
            )
            return true
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING-ACTIVATE',
                `激活失败 | offerId=${promotion.offerId} | 信息=${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    private async getSearchQueries(promotion: BasePromotion): Promise<string[]> {
        interface Queries {
            title: string
            queries: string[]
        }

        let queries: Queries[] = []

        try {
            if (this.bot.config.searchOnBingLocalQueries) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', '使用本地关键词配置文件')

                const data = fs.readFileSync(path.join(__dirname, '../queries.json'), 'utf8')
                queries = JSON.parse(data)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `已加载关键词配置 | 来源=本地 | 条目数=${queries.length}`
                )
            } else {
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    '正在从远程仓库获取关键词配置'
                )

                // Fetch from the repo directly so the user doesn't need to redownload the script for the new activities
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url: 'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v3/src/functions/queries.json'
                })
                queries = response.data

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `已加载关键词配置 | 来源=远程 | 条目数=${queries.length}`
                )
            }

            const answers = queries.find(
                x => this.bot.utils.normalizeString(x.title) === this.bot.utils.normalizeString(promotion.title)
            )

            if (answers && answers.queries.length > 0) {
                const answer = this.bot.utils.shuffleArray(answers.queries)

                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `已找到与活动标题匹配的查询 | 来源=${this.bot.config.searchOnBingLocalQueries ? '本地' : '远程'} | 标题="${promotion.title}" | 数量=${answer.length} | 首个关键词="${answer[0]}"`
                )

                return answer
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `关键词配置中无匹配标题 | 来源=${this.bot.config.searchOnBingLocalQueries ? '本地' : '远程'} | 标题="${promotion.title}"`
                )

                const queryCore = new QueryCore(this.bot)

                const promotionDescription = promotion.description.toLowerCase().trim()
                const queryDescription = promotionDescription.replace('search on bing', '').trim()

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `请求 Bing 建议 | 描述="${queryDescription}"`
                )

                const bingSuggestions = await queryCore.getBingSuggestions(queryDescription)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'SEARCH-ON-BING-QUERY',
                    `Bing 建议结果 | 数量=${bingSuggestions.length} | 标题="${promotion.title}"`
                )

                // If no suggestions found
                if (!bingSuggestions.length) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `未找到建议，回退至活动标题 | 标题="${promotion.title}"`
                    )
                    return [promotion.title]
                } else {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'SEARCH-ON-BING-QUERY',
                        `使用 Bing 建议作为搜索关键词 | 数量=${bingSuggestions.length} | 标题="${promotion.title}"`
                    )
                    return bingSuggestions
                }
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'SEARCH-ON-BING-QUERY',
                `解析搜索关键词时出错 | 标题="${promotion.title}" | 信息=${error instanceof Error ? error.message : String(error)} | 回退=活动标题`
            )
            return [promotion.title]
        }
    }
}
