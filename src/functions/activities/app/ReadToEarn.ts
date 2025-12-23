import type { AxiosRequestConfig } from 'axios'
import { randomBytes } from 'crypto'
import { Workers } from '../../Workers'

export class ReadToEarn extends Workers {
    public async doReadToEarn() {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'READ-TO-EARN',
                '跳过：缺少应用访问令牌，本活动需要该令牌！'
            )
            return
        }

        const delayMin = this.bot.config.searchSettings.readDelay.min
        const delayMax = this.bot.config.searchSettings.readDelay.max
        const startBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'READ-TO-EARN',
            `开始“阅读得分” | 地区=${this.bot.userData.geoLocale} | 延迟范围=${delayMin}-${delayMax} | 当前积分=${startBalance}`
        )

        try {
            const jsonData = {
                amount: 1,
                id: '1',
                type: 101,
                attributes: {
                    offerid: 'ENUS_readarticle3_30points'
                },
                country: this.bot.userData.geoLocale
            }

            const articleCount = 10
            let totalGained = 0
            let articlesRead = 0
            let oldBalance = startBalance

            for (let i = 0; i < articleCount; ++i) {
                jsonData.id = randomBytes(64).toString('hex')

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `提交“阅读得分”活动 | 文章=${i + 1}/${articleCount} | id=${jsonData.id} | 国家=${jsonData.country}`
                )

                const request: AxiosRequestConfig = {
                    url: 'https://prod.rewardsplatform.microsoft.com/dapi/me/activities',
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.bot.accessToken}`,
                        'User-Agent':
                            'Bing/32.5.431027001 (com.microsoft.bing; build:431027001; iOS 17.6.1) Alamofire/5.10.2',
                        'Content-Type': 'application/json',
                        'X-Rewards-Country': this.bot.userData.geoLocale,
                        'X-Rewards-Language': 'en',
                        'X-Rewards-ismobile': 'true'
                    },
                    data: JSON.stringify(jsonData)
                }

                const response = await this.bot.axios.request(request)

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `收到“阅读得分”响应 | 文章=${i + 1}/${articleCount} | 状态=${response?.status ?? 'unknown'}`
                )

                const newBalance = Number(response?.data?.response?.balance ?? oldBalance)
                const gainedPoints = newBalance - oldBalance

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `阅读后积分变化 | 文章=${i + 1}/${articleCount} | 旧积分=${oldBalance} | 新积分=${newBalance} | 获得积分=${gainedPoints}`
                )

                if (gainedPoints <= 0) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'READ-TO-EARN',
                        `未获得积分，停止“阅读得分” | 文章=${i + 1}/${articleCount} | 状态=${response.status} | 旧积分=${oldBalance} | 新积分=${newBalance}`
                    )
                    break
                }

                // Update point tracking
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + gainedPoints
                totalGained += gainedPoints
                articlesRead = i + 1
                oldBalance = newBalance

                this.bot.logger.info(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `已阅读文章 ${i + 1}/${articleCount} | 状态=${response.status} | 获得积分=${gainedPoints} | 新积分=${newBalance}`,
                    'green'
                )

                // Wait random delay between articles
                this.bot.logger.debug(
                    this.bot.isMobile,
                    'READ-TO-EARN',
                    `文章间等待 | 文章=${i + 1}/${articleCount} | 延迟范围=${delayMin}-${delayMax}`
                )

                await this.bot.utils.wait(this.bot.utils.randomDelay(delayMin, delayMax))
            }

            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance)

            this.bot.logger.info(
                this.bot.isMobile,
                'READ-TO-EARN',
                `“阅读得分”已完成 | 阅读文章数=${articlesRead} | 总增量=${totalGained} | 初始积分=${startBalance} | 最终积分=${finalBalance}`
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'READ-TO-EARN',
                `“阅读得分”过程中出错 | 信息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
