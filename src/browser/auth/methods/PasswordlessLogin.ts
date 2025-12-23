import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../../index'

export class PasswordlessLogin {
    private readonly maxAttempts = 60
    private readonly numberDisplaySelector = 'div[data-testid="displaySign"]'
    private readonly approvalPath = '/ppsecure/post.srf'

    constructor(private bot: MicrosoftRewardsBot) {}

    private async getDisplayedNumber(page: Page): Promise<string | null> {
        try {
            const numberElement = await page
                .waitForSelector(this.numberDisplaySelector, {
                    timeout: 5000
                })
                .catch(() => null)

            if (numberElement) {
                const number = await numberElement.textContent()
                return number?.trim() || null
            }
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '无法获取显示的数字')
        }
        return null
    }

    private async waitForApproval(page: Page): Promise<boolean> {
        try {
            this.bot.logger.info(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `正在等待批准...（${this.maxAttempts} 秒后超时）`
            )

            for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
                const currentUrl = new URL(page.url())
                if (currentUrl.pathname === this.approvalPath) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '检测到批准')
                    return true
                }

                // Every 5 seconds to show it's still waiting
                if (attempt % 5 === 0) {
                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN-PASSWORDLESS',
                        `仍在等待...（已过去 ${attempt}/${this.maxAttempts} 秒）`
                    )
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `批准超时（${this.maxAttempts} 秒）！`
            )
            return false
        } catch (error: any) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `批准失败，发生错误：${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    async handle(page: Page): Promise<void> {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '已请求无密码认证')

            const displayedNumber = await this.getDisplayedNumber(page)

            if (displayedNumber) {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN-PASSWORDLESS',
                    `请在设备上批准登录并选择数字：${displayedNumber}`
                )
            } else {
                this.bot.logger.info(
                    this.bot.isMobile,
                    'LOGIN-PASSWORDLESS',
                    '请在验证器应用中批准登录'
                )
            }

            const approved = await this.waitForApproval(page)

            if (approved) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '登录已成功批准')
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
            } else {
                this.bot.logger.error(this.bot.isMobile, 'LOGIN-PASSWORDLESS', '登录批准失败或已超时')
                throw new Error('无密码认证超时')
            }
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-PASSWORDLESS',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
