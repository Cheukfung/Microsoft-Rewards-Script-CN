import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../index'
import type { DashboardData, PunchCard, BasePromotion, FindClippyPromotion } from '../interface/DashboardData'
import type { AppDashboardData } from '../interface/AppDashBoardData'

export class Workers {
    public bot: MicrosoftRewardsBot

    constructor(bot: MicrosoftRewardsBot) {
        this.bot = bot
    }

    public async doDailySet(data: DashboardData, page: Page) {
        const todayKey = this.bot.utils.getFormattedDate()
        const todayData = data.dailySetPromotions[todayKey]

        const activitiesUncompleted = todayData?.filter(x => !x.complete && x.pointProgressMax > 0) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', '“每日任务”已全部完成')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', '开始处理“每日任务”')

        await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'DAILY-SET', '“每日任务”已全部完成')
    }

    public async doMorePromotions(data: DashboardData, page: Page) {
        const morePromotions: BasePromotion[] = [
            ...new Map(
                [...(data.morePromotions ?? []), ...(data.morePromotionsWithoutPromotionalItems ?? [])]
                    .filter(Boolean)
                    .map(p => [p.offerId, p as BasePromotion] as const)
            ).values()
        ]

        const activitiesUncompleted: BasePromotion[] =
            morePromotions?.filter(
                x =>
                    !x.complete &&
                    x.pointProgressMax > 0 &&
                    x.exclusiveLockedFeatureStatus !== 'locked' &&
                    x.promotionType
            ) ?? []

        if (!activitiesUncompleted.length) {
            this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', '“更多促销”活动已全部完成')
            return
        }

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', `开始处理 ${activitiesUncompleted.length} 个“更多促销”活动`)

        await this.solveActivities(activitiesUncompleted, page)

        this.bot.logger.info(this.bot.isMobile, 'MORE-PROMOTIONS', '“更多促销”活动已全部完成')
    }

    public async doAppPromotions(data: AppDashboardData) {
        const appRewards = data.response.promotions.filter(
            x =>
                x.attributes['complete']?.toLowerCase() === 'false' &&
                x.attributes['offerid'] &&
                x.attributes['type'] &&
                x.attributes['type'] === 'sapphire'
        )

        if (!appRewards.length) {
            this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', '“App 促销”活动已全部完成')
            return
        }

        for (const reward of appRewards) {
            await this.bot.activities.doAppReward(reward)
            // A delay between completing each activity
            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
        }

        this.bot.logger.info(this.bot.isMobile, 'APP-PROMOTIONS', '“App 促销”活动已全部完成')
    }

    private async solveActivities(activities: BasePromotion[], page: Page, punchCard?: PunchCard) {
        for (const activity of activities) {
            try {
                const type = activity.promotionType?.toLowerCase() ?? ''
                const name = activity.name?.toLowerCase() ?? ''
                const offerId = (activity as BasePromotion).offerId
                const destinationUrl = activity.destinationUrl?.toLowerCase() ?? ''

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `处理活动 | 标题="${activity.title}" | offerId=${offerId} | 类型=${type} | 打卡="${punchCard?.parentPromotion?.title ?? '无'}"`
                )

                switch (type) {
                    // Quiz-like activities (Poll / regular quiz variants)
                    case 'quiz': {
                        const basePromotion = activity as BasePromotion

                        // Poll (usually 10 points, pollscenarioid in URL)
                        if (activity.pointProgressMax === 10 && destinationUrl.includes('pollscenarioid')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `发现活动类型“投票” | 标题="${activity.title}" | offerId=${offerId}`
                            )

                            //await this.bot.activities.doPoll(basePromotion)
                            break
                        }

                        // All other quizzes handled via Quiz API
                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `发现活动类型“测验” | 标题="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doQuiz(basePromotion)
                        break
                    }

                    // UrlReward
                    case 'urlreward': {
                        const basePromotion = activity as BasePromotion

                        // Search on Bing are subtypes of "urlreward"
                        if (name.includes('exploreonbing')) {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `发现活动类型“Bing 搜索” | 标题="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doSearchOnBing(basePromotion, page)
                        } else {
                            this.bot.logger.info(
                                this.bot.isMobile,
                                'ACTIVITY',
                                `发现活动类型“Url 奖励” | 标题="${activity.title}" | offerId=${offerId}`
                            )

                            await this.bot.activities.doUrlReward(basePromotion)
                        }
                        break
                    }

                    // Find Clippy specific promotion type
                    case 'findclippy': {
                        const clippyPromotion = activity as unknown as FindClippyPromotion

                        this.bot.logger.info(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `发现活动类型“寻找回形针” | 标题="${activity.title}" | offerId=${offerId}`
                        )

                        await this.bot.activities.doFindClippy(clippyPromotion)
                        break
                    }

                    // Unsupported types
                    default: {
                        this.bot.logger.warn(
                            this.bot.isMobile,
                            'ACTIVITY',
                            `已跳过活动 "${activity.title}" | offerId=${offerId} | 原因：不支持的类型 "${activity.promotionType}"`
                        )
                        break
                    }
                }

                // Cooldown
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000))
            } catch (error) {
                this.bot.logger.error(
                    this.bot.isMobile,
                    'ACTIVITY',
                    `处理活动 "${activity.title}" 时出错 | 信息=${error instanceof Error ? error.message : String(error)}`
                )
            }
        }
    }
}
