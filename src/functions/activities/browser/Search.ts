import type { Page } from 'patchright'
import type { Counters, DashboardData } from '../../../interface/DashboardData'

import { QueryCore } from '../../QueryEngine'
import { Workers } from '../../Workers'

export class Search extends Workers {
    private bingHome = 'https://bing.com'
    private searchPageURL = ''
    private searchCount = 0

    public async doSearch(data: DashboardData, page: Page, isMobile: boolean): Promise<number> {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(isMobile, 'SEARCH-BING', `开始进行 Bing 搜索 | 当前积分=${startBalance}`)

        let totalGainedPoints = 0

        try {
            let searchCounters: Counters = await this.bot.browser.func.getSearchPoints()
            const missingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
            let missingPointsTotal = missingPoints.totalPoints

            this.bot.logger.debug(
                isMobile,
                'SEARCH-BING',
                `初始搜索计数 | 移动端=${missingPoints.mobilePoints} | 桌面端=${missingPoints.desktopPoints} | Edge=${missingPoints.edgePoints}`
            )

            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `剩余搜索积分 | Edge=${missingPoints.edgePoints} | 桌面端=${missingPoints.desktopPoints} | 移动端=${missingPoints.mobilePoints}`
            )

            let queries: string[] = []

            const queryCore = new QueryCore(this.bot)

            const locale = this.bot.userData.geoLocale.toUpperCase()

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `解析搜索关键词 | 地区=${locale}`)

            // Set Google search queries
            queries = await queryCore.getGoogleTrends(locale)

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `获取基础关键词 | 数量=${queries.length}`)

            // Deduplicate queries
            queries = [...new Set(queries)]

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `去重后的关键词 | 数量=${queries.length}`)

            // Shuffle
            queries = this.bot.utils.shuffleArray(queries)

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `打乱顺序后的关键词 | 数量=${queries.length}`)

            // Go to bing
            const targetUrl = this.searchPageURL ? this.searchPageURL : this.bingHome
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `正在跳转至搜索页 | url=${targetUrl}`)

            await page.goto(targetUrl)

            // Wait until page loaded
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})

            await this.bot.browser.utils.tryDismissAllMessages(page)

            let stagnantLoop = 0
            const stagnantLoopMax = 10

            for (let i = 0; i < queries.length; i++) {
                const query = queries[i] as string

                searchCounters = await this.bingSearch(page, query, isMobile)
                const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
                const newMissingPointsTotal = newMissingPoints.totalPoints

                // Points gained for THIS query only
                const rawGained = missingPointsTotal - newMissingPointsTotal
                const gainedPoints = Math.max(0, rawGained)

                if (gainedPoints === 0) {
                    stagnantLoop++
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `未获得积分 ${stagnantLoop}/${stagnantLoopMax} | 关键词="${query}" | 剩余=${newMissingPointsTotal}`
                    )
                } else {
                    stagnantLoop = 0

                    // Update global user data
                    const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints
                    this.bot.userData.currentPoints = newBalance
                    this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                    // Track for return value
                    totalGainedPoints += gainedPoints

                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        `获得积分=${gainedPoints} | 关键词="${query}" | 剩余=${newMissingPointsTotal}`,
                        'green'
                    )
                }

                // Update loop state
                missingPointsTotal = newMissingPointsTotal

                // Completed
                if (missingPointsTotal === 0) {
                    this.bot.logger.info(
                        isMobile,
                        'SEARCH-BING',
                        '已获得所有所需搜索积分，停止主循环'
                    )
                    break
                }

                // Stuck
                if (stagnantLoop > stagnantLoopMax) {
                    this.bot.logger.warn(
                        isMobile,
                        'SEARCH-BING',
                        `连续 ${stagnantLoopMax} 次未获得积分，中止主搜索循环`
                    )
                    stagnantLoop = 0
                    break
                }
            }

            if (missingPointsTotal > 0) {
                this.bot.logger.info(
                    isMobile,
                    'SEARCH-BING',
                    `搜索完成但仍有积分缺失，正在生成额外搜索 | 剩余=${missingPointsTotal}`
                )

                let i = 0
                let stagnantLoop = 0
                const stagnantLoopMax = 5

                while (missingPointsTotal > 0) {
                    const query = queries[i++] as string

                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING-EXTRA',
                        `获取额外搜索的相关词 | 基础关键词="${query}"`
                    )

                    const relatedTerms = await queryCore.getBingRelatedTerms(query)
                    this.bot.logger.debug(
                        isMobile,
                        'SEARCH-BING-EXTRA',
                        `相关词已解析 | 基础关键词="${query}" | 数量=${relatedTerms.length}`
                    )

                    if (relatedTerms.length > 3) {
                        for (const term of relatedTerms.slice(1, 3)) {
                            this.bot.logger.info(
                                isMobile,
                                'SEARCH-BING-EXTRA',
                                `额外搜索 | 剩余=${missingPointsTotal} | 关键词="${term}"`
                            )

                            searchCounters = await this.bingSearch(page, term, isMobile)
                            const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile)
                            const newMissingPointsTotal = newMissingPoints.totalPoints

                            // Points gained for THIS extra query only
                            const rawGained = missingPointsTotal - newMissingPointsTotal
                            const gainedPoints = Math.max(0, rawGained)

                            if (gainedPoints === 0) {
                                stagnantLoop++
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `额外搜索未获得积分 ${stagnantLoop}/${stagnantLoopMax} | 关键词="${term}" | 剩余=${newMissingPointsTotal}`
                                )
                            } else {
                                stagnantLoop = 0

                                // Update global user data
                                const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints
                                this.bot.userData.currentPoints = newBalance
                                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                                // Track for return value
                                totalGainedPoints += gainedPoints

                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `获得积分=${gainedPoints} | 关键词="${term}" | 剩余=${newMissingPointsTotal}`,
                                    'green'
                                )
                            }

                            // Update loop state
                            missingPointsTotal = newMissingPointsTotal

                            // Completed
                            if (missingPointsTotal === 0) {
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    'All required search points earned during extra searches'
                                )
                                break
                            }

                            // Stuck again
                            if (stagnantLoop > stagnantLoopMax) {
                                this.bot.logger.warn(
                                    isMobile,
                                    'SEARCH-BING-EXTRA',
                                    `Search did not gain points for ${stagnantLoopMax} extra iterations, aborting extra searches`
                                )
                                const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)
                                this.bot.logger.info(
                                    isMobile,
                                    'SEARCH-BING',
                                    `已中止额外搜索 | 初始积分=${startBalance} | 最终积分=${finalBalance}`
                                )
                                return totalGainedPoints
                            }
                        }
                    }
                }
            }

            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)

            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `已完成 Bing 搜索 | 初始积分=${startBalance} | 新积分=${finalBalance}`
            )

            return totalGainedPoints
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-BING',
                `doSearch 出错 | 信息=${error instanceof Error ? error.message : String(error)}`
            )
            return totalGainedPoints
        }
    }

    private async bingSearch(searchPage: Page, query: string, isMobile: boolean) {
        const maxAttempts = 5
        const refreshThreshold = 10 // Page gets sluggish after x searches?

        this.searchCount++

        // Page fill seems to get more sluggish over time
        if (this.searchCount % refreshThreshold === 0) {
            this.bot.logger.info(
                isMobile,
                'SEARCH-BING',
                `返回首页以清理累计的页面状态 | 次数=${this.searchCount} | 阈值=${refreshThreshold}`
            )

            this.bot.logger.debug(isMobile, 'SEARCH-BING', `返回首页刷新状态 | url=${this.bingHome}`)

            await searchPage.goto(this.bingHome)
            await searchPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
            await this.bot.browser.utils.tryDismissAllMessages(searchPage) // Not always the case but possible for new cookie headers
        }

        this.bot.logger.debug(
            isMobile,
            'SEARCH-BING',
            `开始 bingSearch | 关键词="${query}" | 最大尝试=${maxAttempts} | 搜索次数=${this.searchCount} | 每隔=${refreshThreshold} 次刷新 | 随机滚动=${this.bot.config.searchSettings.scrollRandomResults} | 随机点击=${this.bot.config.searchSettings.clickRandomResults}`
        )

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const searchBar = '#sb_form_q'
                const searchBox = searchPage.locator(searchBar)

                await searchPage.evaluate(() => {
                    window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
                })

                await searchPage.keyboard.press('Home')
                await searchBox.waitFor({ state: 'visible', timeout: 15000 })

                await this.bot.utils.wait(1000)
                await this.bot.browser.utils.ghostClick(searchPage, searchBar, { clickCount: 3 })
                await searchBox.fill('')

                await searchPage.keyboard.type(query, { delay: 50 })
                await searchPage.keyboard.press('Enter')

                this.bot.logger.debug(
                    isMobile,
                    'SEARCH-BING',
                    `已提交查询至 Bing | 尝试=${i + 1}/${maxAttempts} | 关键词="${query}"`
                )

                await this.bot.utils.wait(3000)

                if (this.bot.config.searchSettings.scrollRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.randomScroll(searchPage, isMobile)
                }

                if (this.bot.config.searchSettings.clickRandomResults) {
                    await this.bot.utils.wait(2000)
                    await this.clickRandomLink(searchPage, isMobile)
                }

                await this.bot.utils.wait(
                    this.bot.utils.randomDelay(
                        this.bot.config.searchSettings.searchDelay.min,
                        this.bot.config.searchSettings.searchDelay.max
                    )
                )

                const counters = await this.bot.browser.func.getSearchPoints()

                this.bot.logger.debug(
                    isMobile,
                    'SEARCH-BING',
                    `查询后搜索计数 | 尝试=${i + 1}/${maxAttempts} | 关键词="${query}"`
                )

                return counters
            } catch (error) {
                if (i >= 5) {
                    this.bot.logger.error(
                        isMobile,
                        'SEARCH-BING',
                        `重试 5 次后仍失败 | 关键词="${query}" | 信息=${error instanceof Error ? error.message : String(error)}`
                    )
                    break
                }

                this.bot.logger.error(
                    isMobile,
                    'SEARCH-BING',
                    `搜索尝试失败 | 尝试=${i + 1}/${maxAttempts} | 关键词="${query}" | 信息=${error instanceof Error ? error.message : String(error)}`
                )

                this.bot.logger.warn(
                    isMobile,
                    'SEARCH-BING',
                    `正在重试搜索 | 尝试=${i + 1}/${maxAttempts} | 关键词="${query}"`
                )

                await this.bot.utils.wait(2000)
            }
        }

        this.bot.logger.debug(
            isMobile,
            'SEARCH-BING',
            `重试失败后返回当前搜索计数 | 关键词="${query}"`
        )

        return await this.bot.browser.func.getSearchPoints()
    }

    private async randomScroll(page: Page, isMobile: boolean) {
        try {
            const viewportHeight = await page.evaluate(() => window.innerHeight)
            const totalHeight = await page.evaluate(() => document.body.scrollHeight)
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight))

            this.bot.logger.debug(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `Random scroll | viewportHeight=${viewportHeight} | totalHeight=${totalHeight} | scrollPos=${randomScrollPosition}`
            )

            await page.evaluate((scrollPos: number) => {
                window.scrollTo({ left: 0, top: scrollPos, behavior: 'auto' })
            }, randomScrollPosition)
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-SCROLL',
                `An error occurred during random scroll | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async clickRandomLink(page: Page, isMobile: boolean) {
        try {
            this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Attempting to click a random search result link')

            const searchPageUrl = page.url()

            await this.bot.browser.utils.ghostClick(page, '#b_results .b_algo h2')
            await this.bot.utils.wait(this.bot.config.searchSettings.searchResultVisitTime)

            if (isMobile) {
                // Mobile
                await page.goto(searchPageUrl)
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Navigated back to search page')
            } else {
                // Desktop
                const newTab = await this.bot.browser.utils.getLatestTab(page)
                const newTabUrl = newTab.url()

                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', `Visited result tab | url=${newTabUrl}`)

                await this.bot.browser.utils.closeTabs(newTab)
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', 'Closed result tab')
            }
        } catch (error) {
            this.bot.logger.error(
                isMobile,
                'SEARCH-RANDOM-CLICK',
                `An error occurred during random click | message=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
