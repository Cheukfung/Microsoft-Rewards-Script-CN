import type { Page } from 'patchright'
import * as OTPAuth from 'otpauth'
import readline from 'readline'
import type { MicrosoftRewardsBot } from '../../../index'

export class TotpLogin {
    private readonly textInputSelector =
        'form[name="OneTimeCodeViewForm"] input[type="text"], input#floatingLabelInput5'
    private readonly hiddenInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]'
    private readonly submitButtonSelector = 'button[type="submit"]'
    private readonly maxManualSeconds = 60
    private readonly maxManualAttempts = 5

    constructor(private bot: MicrosoftRewardsBot) {}

    private generateTotpCode(secret: string): string {
        return new OTPAuth.TOTP({ secret, digits: 6 }).generate()
    }

    private async promptManualCode(): Promise<string | null> {
        return await new Promise(resolve => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })

            let resolved = false

            const cleanup = (result: string | null) => {
                if (resolved) return
                resolved = true
                clearTimeout(timer)
                rl.close()
                resolve(result)
            }

            const timer = setTimeout(() => cleanup(null), this.maxManualSeconds * 1000)

            rl.question(`请输入 6 位 TOTP 验证码（等待 ${this.maxManualSeconds}s）：`, answer => {
                cleanup(answer.trim())
            })
        })
    }

    private async fillCode(page: Page, code: string): Promise<boolean> {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null)

            if (visibleInput) {
                await visibleInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '已填写可见的 TOTP 输入框')
                return true
            }

            const hiddenInput = await page.$(this.hiddenInputSelector)

            if (hiddenInput) {
                await hiddenInput.fill(code)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '已填写隐藏的 TOTP 输入框')
                return true
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', '未找到 TOTP 输入框（可见或隐藏）')
            return false
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-TOTP',
                `填写 TOTP 输入框失败：${error instanceof Error ? error.message : String(error)}`
            )
            return false
        }
    }

    async handle(page: Page, totpSecret?: string): Promise<void> {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '已请求 TOTP 双重认证')

            if (totpSecret) {
                const code = this.generateTotpCode(totpSecret)
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '已根据密钥生成 TOTP 验证码')

                const filled = await this.fillCode(page, code)

                if (!filled) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', '无法定位或填写 TOTP 输入框')
                    throw new Error('未找到 TOTP 输入框')
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP 认证已成功完成')
                return
            }

            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '未提供 TOTP 密钥，等待手动输入')

            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await this.promptManualCode()

                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `TOTP 验证码无效或缺失（尝试 ${attempt}/${this.maxManualAttempts}）`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('手动输入 TOTP 失败或超时')
                    }

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        '因验证码无效，正在重试手动输入 TOTP'
                    )
                    continue
                }

                const filled = await this.fillCode(page, code)

                if (!filled) {
                    this.bot.logger.error(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        `无法定位或填写 TOTP 输入框（尝试 ${attempt}/${this.maxManualAttempts}）`
                    )

                    if (attempt === this.maxManualAttempts) {
                        throw new Error('未找到 TOTP 输入框')
                    }

                    this.bot.logger.info(
                        this.bot.isMobile,
                        'LOGIN-TOTP',
                        '因填写失败，正在重试手动输入 TOTP'
                    )
                    continue
                }

                await this.bot.utils.wait(500)
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP 认证已成功完成')
                return
            }

            throw new Error(`手动输入 TOTP 失败，已尝试 ${this.maxManualAttempts} 次`)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'LOGIN-TOTP',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }
}
