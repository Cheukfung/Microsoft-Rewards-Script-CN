import type { AxiosRequestConfig } from 'axios'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class Quiz extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    async doQuiz(promotion: BasePromotion) {
        const offerId = promotion.offerId
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)
        const startBalance = this.oldBalance

        this.bot.logger.info(
            this.bot.isMobile,
            'QUIZ',
            `开始测验 | offerId=${offerId} | 最大积分进度=${promotion.pointProgressMax} | 最大活动进度=${promotion.activityProgressMax} | 当前积分=${startBalance}`
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
                'QUIZ',
                `已准备测验请求头 | offerId=${offerId} | Cookie长度=${this.cookieHeader.length} | 指纹头键数=${Object.keys(this.fingerprintHeader).length}`
            )

            // 8-question quiz
            if (promotion.activityProgressMax === 80) {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'QUIZ',
                    `检测到 8 题测验（activityProgressMax=80），标记为已完成 | offerId=${offerId}`
                )

                // Not implemented
                return
            }

            //Standard points quizzes (20/30/40/50 max)
            if ([20, 30, 40, 50].includes(promotion.pointProgressMax)) {
                let oldBalance = startBalance
                let gainedPoints = 0
                const maxAttempts = 20
                let totalGained = 0
                let attempts = 0

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'QUIZ',
                    `开始 ReportActivity 循环 | offerId=${offerId} | 最大尝试=${maxAttempts} | 初始积分=${oldBalance}`
                )

                for (let i = 0; i < maxAttempts; i++) {
                    try {
                        const jsonData = {
                            UserId: null,
                            TimeZoneOffset: -60,
                            OfferId: offerId,
                            ActivityCount: 1,
                            QuestionIndex: '-1'
                        }

                        const request: AxiosRequestConfig = {
                            url: 'https://www.bing.com/bingqa/ReportActivity?ajaxreq=1',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                cookie: this.cookieHeader,
                                ...this.fingerprintHeader
                            },
                            data: JSON.stringify(jsonData)
                        }

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'QUIZ',
                            `正在发送 ReportActivity 请求 | 尝试=${i + 1}/${maxAttempts} | offerId=${offerId} | url=${request.url}`
                        )

                        const response = await this.bot.axios.request(request)

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'QUIZ',
                            `已接收 ReportActivity 响应 | 尝试=${i + 1}/${maxAttempts} | offerId=${offerId} | 状态=${response.status}`
                        )

                        const newBalance = await this.bot.browser.func.getCurrentPoints()
                        gainedPoints = newBalance - oldBalance

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'QUIZ',
                            `ReportActivity 后积分变化 | 尝试=${i + 1}/${maxAttempts} | offerId=${offerId} | 旧积分=${oldBalance} | 新积分=${newBalance} | 获得积分=${gainedPoints}`
                        )

                        attempts = i + 1

                        if (gainedPoints > 0) {
                            this.bot.userData.currentPoints = newBalance
                            this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints

                            oldBalance = newBalance
                            totalGained += gainedPoints
                            this.gainedPoints += gainedPoints

                            this.bot.logger.info(
                                this.bot.isMobile,
                                'QUIZ',
                                `ReportActivity ${i + 1} → ${response.status} | offerId=${offerId} | 获得积分=${gainedPoints} | 新积分=${newBalance}`,
                                'green'
                            )
                        } else {
                            this.bot.logger.warn(
                                this.bot.isMobile,
                                'QUIZ',
                                `ReportActivity ${i + 1} | offerId=${offerId} | 未再获得积分，结束测验 | 最新积分=${newBalance}`
                            )
                            break
                        }

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'QUIZ',
                            `两次 ReportActivity 间等待 | 尝试=${i + 1}/${maxAttempts} | offerId=${offerId}`
                        )

                        await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000))
                    } catch (error) {
                        this.bot.logger.error(
                            this.bot.isMobile,
                            'QUIZ',
                            `ReportActivity 过程中出错 | 尝试=${i + 1}/${maxAttempts} | offerId=${offerId} | 信息=${error instanceof Error ? error.message : String(error)}`
                        )
                        break
                    }
                }

                this.bot.logger.info(
                    this.bot.isMobile,
                    'QUIZ',
                    `测验已成功完成 | offerId=${offerId} | 尝试次数=${attempts} | 总增量=${totalGained} | 初始积分=${startBalance} | 最终积分=${this.bot.userData.currentPoints}`
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'QUIZ',
                    `不支持的测验配置 | offerId=${offerId} | 最大积分进度=${promotion.pointProgressMax} | 最大活动进度=${promotion.activityProgressMax}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'QUIZ',
                `doQuiz 出错 | offerId=${promotion.offerId} | 信息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
