import type { BrowserContext } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import { MicrosoftRewardsBot, executionContext } from '../index'
import type { DashboardData } from '../interface/DashboardData'
import type { Account } from '../interface/Account'

interface BrowserSession {
    context: BrowserContext
    fingerprint: BrowserFingerprintWithHeaders
}

interface MissingSearchPoints {
    mobilePoints: number
    desktopPoints: number
}

interface SearchResults {
    mobilePoints: number
    desktopPoints: number
}

export class SearchManager {
    constructor(private bot: MicrosoftRewardsBot) {}

    async doSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string
    ): Promise<SearchResults> {
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `Start | account=${accountEmail} | mobileMissing=${missingSearchPoints.mobilePoints} | desktopMissing=${missingSearchPoints.desktopPoints}`
        )

        const doMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const doDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        const mobileStatus = this.bot.config.workers.doMobileSearch
            ? missingSearchPoints.mobilePoints > 0
                ? '执行'
                : '跳过-无积分'
            : '跳过-已禁用'
        const desktopStatus = this.bot.config.workers.doDesktopSearch
            ? missingSearchPoints.desktopPoints > 0
                ? '执行'
                : '跳过-无积分'
            : '跳过-已禁用'

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `移动端: ${mobileStatus} (启用=${this.bot.config.workers.doMobileSearch}, 缺失=${missingSearchPoints.mobilePoints})`
        )
        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `桌面端: ${desktopStatus} (启用=${this.bot.config.workers.doDesktopSearch}, 缺失=${missingSearchPoints.desktopPoints})`
        )

        if (!doMobile && !doDesktop) {
            const bothWorkersEnabled = this.bot.config.workers.doMobileSearch && this.bot.config.workers.doDesktopSearch
            const bothNoPoints = missingSearchPoints.mobilePoints <= 0 && missingSearchPoints.desktopPoints <= 0

            if (bothWorkersEnabled && bothNoPoints) {
                this.bot.logger.info(
                    'main',
                    'SEARCH-MANAGER',
                    '全部搜索已跳过：移动端与桌面端均无剩余积分。'
                )
            } else {
                this.bot.logger.info('main', 'SEARCH-MANAGER', '未安排搜索（功能禁用或无积分）。')
            }

            this.bot.logger.info('main', 'SEARCH-MANAGER', '正在关闭移动端会话')
            try {
                await executionContext.run({ isMobile: true, accountEmail }, async () => {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                })
                this.bot.logger.info('main', 'SEARCH-MANAGER', '移动端会话已关闭')
            } catch (error) {
                this.bot.logger.warn(
                    'main',
                    'SEARCH-MANAGER',
                    `关闭移动端会话失败：${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MANAGER', `移动端关闭堆栈：${error.stack}`)
                }
            }
            return { mobilePoints: 0, desktopPoints: 0 }
        }

        const useParallel = this.bot.config.searchSettings.parallelSearching
        this.bot.logger.info('main', 'SEARCH-MANAGER', `模式：${useParallel ? '并行' : '顺序'}`)
        this.bot.logger.debug('main', 'SEARCH-MANAGER', `parallelSearching=${useParallel} | 账户=${accountEmail}`)

        if (useParallel) {
            return await this.doParallelSearches(
                data,
                missingSearchPoints,
                mobileSession,
                account,
                accountEmail,
                executionContext
            )
        } else {
            return await this.doSequentialSearches(
                data,
                missingSearchPoints,
                mobileSession,
                account,
                accountEmail,
                executionContext
            )
        }
    }

    private async doParallelSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<SearchResults> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', '并行开始')
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `并行配置 | 账户=${accountEmail} | 移动缺失=${missingSearchPoints.mobilePoints} | 桌面缺失=${missingSearchPoints.desktopPoints}`
        )

        const shouldDoMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const shouldDoDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `并行标志 | 移动端=${shouldDoMobile} | 桌面端=${shouldDoDesktop}`
        )

        let desktopSession: BrowserSession | null = null
        let mobileContextClosed = false

        try {
            const promises: Promise<number>[] = []
            const searchTypes: string[] = []

            if (shouldDoMobile) {
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `调度移动端 | 目标=${missingSearchPoints.mobilePoints}`
                )
                searchTypes.push('移动端')
                promises.push(
                    this.doMobileSearch(data, missingSearchPoints, mobileSession, accountEmail, executionContext).then(
                        points => {
                            mobileContextClosed = true
                            this.bot.logger.info('main', 'SEARCH-MANAGER', `移动端完成 | 获得=${points}`)
                            return points
                        }
                    )
                )
            } else {
                const reason = !this.bot.config.workers.doMobileSearch ? '已禁用' : '无积分'
                this.bot.logger.info('main', 'SEARCH-MANAGER', `跳过移动端（${reason}）；正在关闭移动端会话`)
                await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                mobileContextClosed = true
                this.bot.logger.info('main', 'SEARCH-MANAGER', '已关闭移动端会话（未进行移动端搜索）')
            }

            if (shouldDoDesktop) {
                this.bot.logger.info('main', 'SEARCH-MANAGER', '桌面端登录开始')
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `桌面端登录 | 账户=${accountEmail} | 代理=${account.proxy ?? '无'}`
                )
                desktopSession = await executionContext.run({ isMobile: false, accountEmail }, async () =>
                    this.createDesktopSession(account, accountEmail)
                )
                this.bot.logger.info('main', 'SEARCH-MANAGER', '桌面端登录完成')
            } else {
                const reason = !this.bot.config.workers.doDesktopSearch ? '已禁用' : '无积分'
                this.bot.logger.info('main', 'SEARCH-MANAGER', `跳过桌面端登录（${reason}）`)
            }

            if (shouldDoDesktop && desktopSession) {
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MANAGER',
                    `调度桌面端 | 目标=${missingSearchPoints.desktopPoints}`
                )
                searchTypes.push('桌面端')
                promises.push(
                    this.doDesktopSearch(
                        data,
                        missingSearchPoints,
                        desktopSession,
                        accountEmail,
                        executionContext
                    ).then(points => {
                        this.bot.logger.info('main', 'SEARCH-MANAGER', `桌面端完成 | 获得=${points}`)
                        return points
                    })
                )
            }

            this.bot.logger.info('main', 'SEARCH-MANAGER', `并行执行：${searchTypes.join(' + ') || '无'}`)

            const results = await Promise.all(promises)

            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `并行结果 | 账户=${accountEmail} | 结果=${JSON.stringify(results)}`
            )

            const mobilePoints = shouldDoMobile ? (results[0] ?? 0) : 0
            const desktopPoints = shouldDoDesktop ? (results[shouldDoMobile ? 1 : 0] ?? 0) : 0

            this.bot.logger.info(
                'main',
                'SEARCH-MANAGER',
                `并行汇总 | 移动端=${mobilePoints} | 桌面端=${desktopPoints} | 总计=${mobilePoints + desktopPoints}`
            )

            return { mobilePoints, desktopPoints }
        } catch (error) {
            this.bot.logger.error(
                'main',
                'SEARCH-MANAGER',
                `并行失败：${error instanceof Error ? error.message : String(error)}`
            )
            if (error instanceof Error && error.stack) {
                this.bot.logger.debug('main', 'SEARCH-MANAGER', `并行堆栈：${error.stack}`)
            }
            throw error
        } finally {
            if (!mobileContextClosed && mobileSession) {
                this.bot.logger.info('main', 'SEARCH-MANAGER', '清理：正在关闭移动端会话')
                this.bot.logger.debug('main', 'SEARCH-MANAGER', `清理移动端 | 账户=${accountEmail}`)
                try {
                    await executionContext.run({ isMobile: true, accountEmail }, async () => {
                        await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                    })
                    this.bot.logger.info('main', 'SEARCH-MANAGER', '清理：移动端会话已关闭')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-MANAGER',
                        `清理：移动端关闭失败：${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-MANAGER', `清理移动端堆栈：${error.stack}`)
                    }
                }
            }
        }
    }

    private async doSequentialSearches(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<SearchResults> {
        this.bot.logger.info('main', 'SEARCH-MANAGER', '顺序开始')
        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `顺序配置 | 账户=${accountEmail} | 移动缺失=${missingSearchPoints.mobilePoints} | 桌面缺失=${missingSearchPoints.desktopPoints}`
        )

        const shouldDoMobile = this.bot.config.workers.doMobileSearch && missingSearchPoints.mobilePoints > 0
        const shouldDoDesktop = this.bot.config.workers.doDesktopSearch && missingSearchPoints.desktopPoints > 0

        this.bot.logger.debug(
            'main',
            'SEARCH-MANAGER',
            `顺序标志 | 移动端=${shouldDoMobile} | 桌面端=${shouldDoDesktop}`
        )

        let mobilePoints = 0
        let desktopPoints = 0

        if (shouldDoMobile) {
            this.bot.logger.info('main', 'SEARCH-MANAGER', '步骤 1：移动端')
            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `顺序移动端 | 目标=${missingSearchPoints.mobilePoints}`
            )
            mobilePoints = await this.doMobileSearch(
                data,
                missingSearchPoints,
                mobileSession,
                accountEmail,
                executionContext
            )
            this.bot.logger.info('main', 'SEARCH-MANAGER', `步骤 1：移动端完成 | 获得=${mobilePoints}`)
        } else {
            const reason = !this.bot.config.workers.doMobileSearch ? '已禁用' : '无积分'
            this.bot.logger.info('main', 'SEARCH-MANAGER', `步骤 1：跳过移动端（${reason}）；正在关闭移动端会话`)
            this.bot.logger.debug('main', 'SEARCH-MANAGER', '正在关闭未使用的移动端上下文')
            try {
                await executionContext.run({ isMobile: true, accountEmail }, async () => {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                })
                this.bot.logger.info('main', 'SEARCH-MANAGER', '未使用的移动端会话已关闭')
            } catch (error) {
                this.bot.logger.warn(
                    'main',
                    'SEARCH-MANAGER',
                    `未使用的移动端关闭失败：${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MANAGER', `未使用的移动端堆栈：${error.stack}`)
                }
            }
        }

        if (shouldDoDesktop) {
            this.bot.logger.info('main', 'SEARCH-MANAGER', '步骤 2：桌面端')
            this.bot.logger.debug(
                'main',
                'SEARCH-MANAGER',
                `顺序桌面端 | 目标=${missingSearchPoints.desktopPoints}`
            )
            desktopPoints = await this.doDesktopSearchSequential(
                data,
                missingSearchPoints,
                account,
                accountEmail,
                executionContext
            )
            this.bot.logger.info('main', 'SEARCH-MANAGER', `步骤 2：桌面端完成 | 获得=${desktopPoints}`)
        } else {
            const reason = !this.bot.config.workers.doDesktopSearch ? '已禁用' : '无积分'
            this.bot.logger.info('main', 'SEARCH-MANAGER', `步骤 2：跳过桌面端（${reason}）`)
        }

        this.bot.logger.info(
            'main',
            'SEARCH-MANAGER',
            `顺序汇总 | 移动端=${mobilePoints} | 桌面端=${desktopPoints} | 总计=${mobilePoints + desktopPoints}`
        )
        this.bot.logger.debug('main', 'SEARCH-MANAGER', `顺序完成 | 账户=${accountEmail}`)

        return { mobilePoints, desktopPoints }
    }

    private async createDesktopSession(account: Account, accountEmail: string): Promise<BrowserSession> {
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', '初始化桌面端会话')
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-LOGIN',
            `初始化 | 账户=${accountEmail} | 代理=${account.proxy ?? '无'}`
        )

        const session = await this.bot['browserFactory'].createBrowser(account.proxy, accountEmail)
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', '浏览器已创建，打开新页面')

        this.bot.mainDesktopPage = await session.context.newPage()

        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', `浏览器已就绪 | 账户=${accountEmail}`)
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', '登录开始')
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', '调用登录处理器')

        await this.bot['login'].login(this.bot.mainDesktopPage, accountEmail, account.password, account.totp)

        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', '登录通过，正在验证')
        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', '验证 Bing 会话')

        await this.bot['login'].verifyBingSession(this.bot.mainDesktopPage)
        this.bot.cookies.desktop = await session.context.cookies()

        this.bot.logger.debug('main', 'SEARCH-DESKTOP-LOGIN', 'Cookies 已保存')
        this.bot.logger.info('main', 'SEARCH-DESKTOP-LOGIN', '桌面端会话已就绪')

        return session
    }

    private async doMobileSearch(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        mobileSession: BrowserSession,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-MOBILE-SEARCH',
            `开始 | 账户=${accountEmail} | 目标=${missingSearchPoints.mobilePoints}`
        )

        return await executionContext.run({ isMobile: true, accountEmail }, async () => {
            try {
                if (!this.bot.config.workers.doMobileSearch) {
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', '跳过：配置中禁用了该工作项')
                    return 0
                }

                if (missingSearchPoints.mobilePoints === 0) {
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', '跳过：无剩余积分')
                    return 0
                }

                this.bot.logger.info(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `搜索开始 | 目标=${missingSearchPoints.mobilePoints}`
                )
                this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', 'activities.doSearch（移动端）')

                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainMobilePage, true)

                this.bot.logger.info(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `搜索完成 | 获得=${pointsEarned}/${missingSearchPoints.mobilePoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `结果 | 账户=${accountEmail} | 获得=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-MOBILE-SEARCH',
                    `失败：${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `堆栈：${error.stack}`)
                }
                return 0
            } finally {
                this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', '正在关闭移动端会话')
                this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `正在关闭上下文 | 账户=${accountEmail}`)
                try {
                    await this.bot.browser.func.closeBrowser(mobileSession.context, accountEmail)
                    this.bot.logger.info('main', 'SEARCH-MOBILE-SEARCH', '移动端浏览器已关闭')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-MOBILE-SEARCH',
                        `关闭失败：${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-MOBILE-SEARCH', `关闭堆栈：${error.stack}`)
                    }
                }
            }
        })
    }

    private async doDesktopSearch(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        desktopSession: BrowserSession,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-PARALLEL',
            `开始 | 账户=${accountEmail} | 目标=${missingSearchPoints.desktopPoints}`
        )

        return await executionContext.run({ isMobile: false, accountEmail }, async () => {
            try {
                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `搜索开始 | 目标=${missingSearchPoints.desktopPoints}`
                )
                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainDesktopPage, false)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `搜索完成 | 获得=${pointsEarned}/${missingSearchPoints.desktopPoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `结果 | 账户=${accountEmail} | 获得=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-DESKTOP-PARALLEL',
                    `失败：${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `堆栈：${error.stack}`)
                }
                return 0
            } finally {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-PARALLEL', '正在关闭桌面端会话')
                this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `正在关闭上下文 | 账户=${accountEmail}`)
                try {
                    await this.bot.browser.func.closeBrowser(desktopSession.context, accountEmail)
                    this.bot.logger.info('main', 'SEARCH-DESKTOP-PARALLEL', '桌面端浏览器已关闭')
                } catch (error) {
                    this.bot.logger.warn(
                        'main',
                        'SEARCH-DESKTOP-PARALLEL',
                        `关闭失败：${error instanceof Error ? error.message : String(error)}`
                    )
                    if (error instanceof Error && error.stack) {
                        this.bot.logger.debug('main', 'SEARCH-DESKTOP-PARALLEL', `关闭堆栈：${error.stack}`)
                    }
                }
            }
        })
    }

    private async doDesktopSearchSequential(
        data: DashboardData,
        missingSearchPoints: MissingSearchPoints,
        account: Account,
        accountEmail: string,
        executionContext: any
    ): Promise<number> {
        this.bot.logger.debug(
            'main',
            'SEARCH-DESKTOP-SEQUENTIAL',
            `开始 | 账户=${accountEmail} | 目标=${missingSearchPoints.desktopPoints}`
        )

        return await executionContext.run({ isMobile: false, accountEmail }, async () => {
            if (!this.bot.config.workers.doDesktopSearch) {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', '跳过：配置中禁用了该工作项')
                return 0
            }

            if (missingSearchPoints.desktopPoints === 0) {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', '跳过：无剩余积分')
                return 0
            }

            let desktopSession: BrowserSession | null = null
            try {
                this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', '初始化桌面端会话')
                desktopSession = await this.createDesktopSession(account, accountEmail)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `搜索开始 | 目标=${missingSearchPoints.desktopPoints}`
                )

                const pointsEarned = await this.bot.activities.doSearch(data, this.bot.mainDesktopPage, false)

                this.bot.logger.info(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `搜索完成 | 获得=${pointsEarned}/${missingSearchPoints.desktopPoints}`
                )
                this.bot.logger.debug(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `结果 | 账户=${accountEmail} | 获得=${pointsEarned}`
                )

                return pointsEarned
            } catch (error) {
                this.bot.logger.error(
                    'main',
                    'SEARCH-DESKTOP-SEQUENTIAL',
                    `失败：${error instanceof Error ? error.message : String(error)}`
                )
                if (error instanceof Error && error.stack) {
                    this.bot.logger.debug('main', 'SEARCH-DESKTOP-SEQUENTIAL', `堆栈：${error.stack}`)
                }
                return 0
            } finally {
                if (desktopSession) {
                    this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', '正在关闭桌面端会话')
                    this.bot.logger.debug(
                        'main',
                        'SEARCH-DESKTOP-SEQUENTIAL',
                        `正在关闭上下文 | 账户=${accountEmail}`
                    )
                    try {
                        await this.bot.browser.func.closeBrowser(desktopSession.context, accountEmail)
                        this.bot.logger.info('main', 'SEARCH-DESKTOP-SEQUENTIAL', '桌面端浏览器已关闭')
                    } catch (error) {
                        this.bot.logger.warn(
                            'main',
                            'SEARCH-DESKTOP-SEQUENTIAL',
                            `关闭失败：${error instanceof Error ? error.message : String(error)}`
                        )
                        if (error instanceof Error && error.stack) {
                            this.bot.logger.debug('main', 'SEARCH-DESKTOP-SEQUENTIAL', `关闭堆栈：${error.stack}`)
                        }
                    }
                }
            }
        })
    }
}
