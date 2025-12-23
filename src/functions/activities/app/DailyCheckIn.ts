import type { AxiosRequestConfig } from 'axios'
import { randomUUID } from 'crypto'
import { Workers } from '../../Workers'

export class DailyCheckIn extends Workers {
    private gainedPoints: number = 0

    private oldBalance: number = this.bot.userData.currentPoints

    public async doDailyCheckIn() {
        if (!this.bot.accessToken) {
            this.bot.logger.warn(this.bot.isMobile, 'DAILY-CHECK-IN', '跳过：缺少应用访问令牌，本活动需要该令牌！')
            return
        }

        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0)

        this.bot.logger.info(
            this.bot.isMobile,
            'DAILY-CHECK-IN',
            `开始每日签到 | 国家=${this.bot.userData.geoLocale} | 当前积分=${this.oldBalance}`
        )

        try {
            // Try type 101 first
            this.bot.logger.debug(this.bot.isMobile, 'DAILY-CHECK-IN', '正在尝试每日签到 | 类型=101')

            let response = await this.submitDaily(101) // Try using 101 (EU Variant?)
            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `已接收每日签到响应 | 类型=101 | 状态=${response?.status ?? 'unknown'}`
            )

            let newBalance = Number(response?.data?.response?.balance ?? this.oldBalance)
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `每日签到后积分变化 | 类型=101 | 旧积分=${this.oldBalance} | 新积分=${newBalance} | 获得积分=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `每日签到完成 | 类型=101 | 获得积分=${this.gainedPoints} | 旧积分=${this.oldBalance} | 新积分=${newBalance}`,
                    'green'
                )
                return
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `类型=101 未获得积分 | 旧积分=${this.oldBalance} | 新积分=${newBalance} | 重试类型=103`
            )

            // Fallback to type 103
            this.bot.logger.debug(this.bot.isMobile, 'DAILY-CHECK-IN', '正在尝试每日签到 | 类型=103')

            response = await this.submitDaily(103) // Try using 103 (USA Variant?)
            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `已接收每日签到响应 | 类型=103 | 状态=${response?.status ?? 'unknown'}`
            )

            newBalance = Number(response?.data?.response?.balance ?? this.oldBalance)
            this.gainedPoints = newBalance - this.oldBalance

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `每日签到后积分变化 | 类型=103 | 旧积分=${this.oldBalance} | 新积分=${newBalance} | 获得积分=${this.gainedPoints}`
            )

            if (this.gainedPoints > 0) {
                this.bot.userData.currentPoints = newBalance
                this.bot.userData.gainedPoints = (this.bot.userData.gainedPoints ?? 0) + this.gainedPoints

                this.bot.logger.info(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `每日签到完成 | 类型=103 | 获得积分=${this.gainedPoints} | 旧积分=${this.oldBalance} | 新积分=${newBalance}`,
                    'green'
                )
            } else {
                this.bot.logger.warn(
                    this.bot.isMobile,
                    'DAILY-CHECK-IN',
                    `每日签到已完成但未获得积分 | 尝试类型=101,103 | 旧积分=${this.oldBalance} | 最终积分=${newBalance}`
                )
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `每日签到出错 | 信息=${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async submitDaily(type: number) {
        try {
            const jsonData = {
                id: randomUUID(),
                amount: 1,
                type: type,
                attributes: {
                    offerid: 'Gamification_Sapphire_DailyCheckIn'
                },
                country: this.bot.userData.geoLocale
            }

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `正在准备每日签到负载 | 类型=${type} | id=${jsonData.id} | 数量=${jsonData.amount} | 国家=${jsonData.country}`
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

            this.bot.logger.debug(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `正在发送每日签到请求 | 类型=${type} | url=${request.url}`
            )

            return this.bot.axios.request(request)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'DAILY-CHECK-IN',
                `submitDaily 出错 | 类型=${type} | 信息=${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
