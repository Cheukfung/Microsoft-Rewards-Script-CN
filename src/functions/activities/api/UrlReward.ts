import type { AxiosRequestConfig } from 'axios'
import type { BasePromotion } from '../../../interface/DashboardData'
import { Workers } from '../../Workers'

export class UrlReward extends Workers {
    private cookieHeader: string = ''

    private fingerprintHeader: { [x: string]: string } = {}

    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doUrlReward(promotion: BasePromotion) {
        if (!this.bot.requestToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'URL-REWARD',
                '跳过：缺少请求令牌，本活动需要该令牌！'
            )
            return
        }

        const offerId = promotion.offerId

        this.bot.logger.info(
            this.bot.isMobile,
            'URL-REWARD',
            `开始 UrlReward | offerId=${offerId} | 地区=${this.bot.userData.geoLocale} | 旧积分=${this.oldBalance}`
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
            'URL-REWARD',
            `已准备 UrlReward 请求头 | offerId=${offerId} | Cookie长度=${this.cookieHeader.length} | 指纹头键数=${Object.keys(this.fingerprintHeader).length}`
        )

            const formData = new URLSearchParams({
                id: offerId,
                hash: promotion.hash,
                timeZone: '60',
                activityAmount: '1',
                dbs: '0',
                form: '',
                type: '',
                __RequestVerificationToken: this.bot.requestToken
            })

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `已准备 UrlReward 表单数据 | offerId=${offerId} | hash=${promotion.hash} | timeZone=60 | activityAmount=1`
        )

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

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `正在发送 UrlReward 请求 | offerId=${offerId} | url=${request.url}`
        )

            const response = await this.bot.axios.request(request)

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `已接收 UrlReward 响应 | offerId=${offerId} | 状态=${response.status}`
        )

            const newBalance = await this.bot.browser.func.getCurrentPoints()
            this.gainedPoints = newBalance - this.oldBalance

        this.bot.logger.debug(
            this.bot.isMobile,
            'URL-REWARD',
            `UrlReward 后积分变化 | offerId=${offerId} | 旧积分=${this.oldBalance} | 新积分=${newBalance} | 获得积分=${this.gainedPoints}`
        )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `UrlReward 完成 | offerId=${offerId} | 状态=${response.status} | 获得积分=${this.gainedPoints} | 新积分=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'URL-REWARD',
                    `UrlReward 未获得积分 | offerId=${offerId} | 状态=${response.status} | 旧积分=${this.oldBalance} | 新积分=${newBalance}`
                )
            }

            this.bot.logger.debug(this.bot.isMobile, 'URL-REWARD', `UrlReward 后等待 | offerId=${offerId}`)

            await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 10000))
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'URL-REWARD',
                `doUrlReward 出错 | offerId=${promotion.offerId} | 信息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
