import type { Page } from 'patchright'
import type { MicrosoftRewardsBot } from '../../index'
import { saveSessionData } from '../../util/Load'

// Methods
import { MobileAccessLogin } from './methods/MobileAccessLogin'
import { EmailLogin } from './methods/EmailLogin'
import { PasswordlessLogin } from './methods/PasswordlessLogin'
import { TotpLogin } from './methods/Totp2FALogin'

type LoginState =
    | 'EMAIL_INPUT'
    | 'PASSWORD_INPUT'
    | 'SIGN_IN_ANOTHER_WAY'
    | 'PASSKEY_ERROR'
    | 'PASSKEY_VIDEO'
    | 'KMSI_PROMPT'
    | 'LOGGED_IN'
    | 'ACCOUNT_LOCKED'
    | 'ERROR_ALERT'
    | '2FA_TOTP'
    | 'LOGIN_PASSWORDLESS'
    | 'GET_A_CODE'
    | 'UNKNOWN'
    | 'CHROMEWEBDATA_ERROR'

export class Login {
    emailLogin: EmailLogin
    passwordlessLogin: PasswordlessLogin
    totp2FALogin: TotpLogin
    constructor(private bot: MicrosoftRewardsBot) {
        this.emailLogin = new EmailLogin(this.bot)
        this.passwordlessLogin = new PasswordlessLogin(this.bot)
        this.totp2FALogin = new TotpLogin(this.bot)
    }

    private readonly primaryButtonSelector = 'button[data-testid="primaryButton"]'
    private readonly secondaryButtonSelector = 'button[data-testid="secondaryButton"]'

    async login(page: Page, email: string, password: string, totpSecret?: string) {
        try {
            this.bot.logger.info(this.bot.isMobile, '登录', '开始登录流程')

            await page.goto('https://www.bing.com/rewards/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {})
            await this.bot.utils.wait(2000)
            await this.bot.browser.utils.reloadBadPage(page)

            await this.bot.browser.utils.disableFido(page)

            const maxIterations = 25
            let iteration = 0

            let previousState: LoginState = 'UNKNOWN'
            let sameStateCount = 0

            while (iteration < maxIterations) {
                if (page.isClosed()) throw new Error('页面意外关闭')

                iteration++
                this.bot.logger.debug(this.bot.isMobile, '登录', `状态检查迭代 ${iteration}/${maxIterations}`)

                const state = await this.detectCurrentState(page)
                this.bot.logger.debug(this.bot.isMobile, '登录', `当前状态：${state}`)

                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.info(this.bot.isMobile, '登录', `状态切换：${previousState} → ${state}`)
                }

                if (state === previousState && state !== 'LOGGED_IN' && state !== 'UNKNOWN') {
                    sameStateCount++
                    if (sameStateCount >= 4) {
                        this.bot.logger.warn(this.bot.isMobile, '登录', `在状态 "${state}" 连续 4 次循环卡住，正在刷新页面...`)
                        await page.reload({ waitUntil: 'domcontentloaded' })
                        await this.bot.utils.wait(3000)
                        sameStateCount = 0
                        previousState = 'UNKNOWN'
                        continue
                    }
                } else {
                    sameStateCount = 0
                }
                previousState = state

                if (state === 'LOGGED_IN') {
                    this.bot.logger.info(this.bot.isMobile, '登录', '登录成功')
                    break
                }

                const shouldContinue = await this.handleState(state, page, email, password, totpSecret)

                if (!shouldContinue) {
                    throw new Error(`Login failed or aborted at state: ${state}`)
                }

                await this.bot.utils.wait(1000)
            }

            if (iteration >= maxIterations) {
                throw new Error('Login timeout: exceeded maximum iterations')
            }

            await this.finalizeLogin(page, email)
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                '登录',
                `发生错误：${error instanceof Error ? error.message : String(error)}`
            )
            throw error
        }
    }

    private async detectCurrentState(page: Page): Promise<LoginState> {
        // Make sure we settled before getting a URL
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

        const url = new URL(page.url())

        this.bot.logger.debug(this.bot.isMobile, 'DETECT-CURRENT-STATE', `当前 URL：${url}`)

        if (url.hostname === 'chromewebdata') {
            this.bot.logger.warn(this.bot.isMobile, 'DETECT-CURRENT-STATE', '检测到 chromewebdata 错误页面')
            return 'CHROMEWEBDATA_ERROR'
        }

        const isLocked = await page
            .waitForSelector('#serviceAbuseLandingTitle', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)
        if (isLocked) {
            return 'ACCOUNT_LOCKED'
        }

        // If instantly loading rewards dash, logged in
        if (url.hostname === 'rewards.bing.com') {
            return 'LOGGED_IN'
        }

        // If account dash, logged in
        if (url.hostname === 'account.microsoft.com') {
            return 'LOGGED_IN'
        }

        const check = async (selector: string, state: LoginState): Promise<LoginState | null> => {
            return page
                .waitForSelector(selector, { state: 'visible', timeout: 200 })
                .then(visible => (visible ? state : null))
                .catch(() => null)
        }

        const results = await Promise.all([
            check('div[role="alert"]', 'ERROR_ALERT'),
            check('[data-testid="passwordEntry"]', 'PASSWORD_INPUT'),
            check('input#usernameEntry', 'EMAIL_INPUT'),
            check('[data-testid="kmsiVideo"]', 'KMSI_PROMPT'),
            check('[data-testid="biometricVideo"]', 'PASSKEY_VIDEO'),
            check('[data-testid="registrationImg"]', 'PASSKEY_ERROR'),
            check('[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])', 'SIGN_IN_ANOTHER_WAY'),
            check('[data-testid="deviceShieldCheckmarkVideo"]', 'LOGIN_PASSWORDLESS'),
            check('input[name="otc"]', '2FA_TOTP'),
            check('form[name="OneTimeCodeViewForm"]', '2FA_TOTP')
        ])

        // Get a code
        const identityBanner = await page
            .waitForSelector('[data-testid="identityBanner"]', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        const primaryButton = await page
            .waitForSelector(this.primaryButtonSelector, { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        const passwordEntry = await page
            .waitForSelector('[data-testid="passwordEntry"]', { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false)

        if (identityBanner && primaryButton && !passwordEntry && !results.includes('2FA_TOTP')) {
            results.push('GET_A_CODE') // Lower prio
        }

        // Final
        let foundStates = results.filter((s): s is LoginState => s !== null)

        if (foundStates.length === 0) return 'UNKNOWN'

        if (foundStates.includes('ERROR_ALERT')) {
            if (url.hostname !== 'login.live.com') {
                // Remove ERROR_ALERT if not on login.live.com
                foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
            }
            if (foundStates.includes('2FA_TOTP')) {
                // Don't throw on TOTP if expired code is entered
                foundStates = foundStates.filter(s => s !== 'ERROR_ALERT')
            }

            // On login.live.com, keep it
            return 'ERROR_ALERT'
        }

        if (foundStates.includes('ERROR_ALERT')) return 'ERROR_ALERT'
        if (foundStates.includes('ACCOUNT_LOCKED')) return 'ACCOUNT_LOCKED'
        if (foundStates.includes('PASSKEY_VIDEO')) return 'PASSKEY_VIDEO'
        if (foundStates.includes('PASSKEY_ERROR')) return 'PASSKEY_ERROR'
        if (foundStates.includes('KMSI_PROMPT')) return 'KMSI_PROMPT'
        if (foundStates.includes('PASSWORD_INPUT')) return 'PASSWORD_INPUT'
        if (foundStates.includes('EMAIL_INPUT')) return 'EMAIL_INPUT'
        if (foundStates.includes('SIGN_IN_ANOTHER_WAY')) return 'SIGN_IN_ANOTHER_WAY'
        if (foundStates.includes('LOGIN_PASSWORDLESS')) return 'LOGIN_PASSWORDLESS'
        if (foundStates.includes('2FA_TOTP')) return '2FA_TOTP'

        const mainState = foundStates[0] as LoginState

        return mainState
    }

    private async handleState(
        state: LoginState,
        page: Page,
        email: string,
        password: string,
        totpSecret?: string
    ): Promise<boolean> {
        switch (state) {
            case 'ACCOUNT_LOCKED': {
                const msg = '该账户已被锁定！请从配置中移除并重新运行！'
                this.bot.logger.error(this.bot.isMobile, 'CHECK-LOCKED', msg)
                throw new Error(msg)
            }

            case 'ERROR_ALERT': {
                const alertEl = page.locator('div[role="alert"]')
                const errorMsg = await alertEl.innerText().catch(() => '未知错误')
                this.bot.logger.error(this.bot.isMobile, '登录', `账户错误：${errorMsg}`)
                throw new Error(`Microsoft 登录错误信息：${errorMsg}`)
            }

            case 'LOGGED_IN':
                return true

            case 'EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, '登录', '正在输入邮箱')
                await this.emailLogin.enterEmail(page, email)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'PASSWORD_INPUT': {
                this.bot.logger.info(this.bot.isMobile, '登录', '正在输入密码')
                await this.emailLogin.enterPassword(page, password)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'GET_A_CODE': {
                this.bot.logger.info(this.bot.isMobile, '登录', '尝试绕过“获取验证码”流程')
                // Select sign in other way
                await this.bot.browser.utils.ghostClick(page, '[data-testid="viewFooter"] span[role="button"]')
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(this.bot.isMobile, '登录', '检测到 chromewebdata 错误页面，尝试恢复到 Rewards 首页')
                // Try go to Rewards dashboard
                try {
                    await page
                        .goto(this.bot.config.baseURL, {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})

                    await this.bot.utils.wait(3000)
                    return true
                } catch {
                    // If even that fails, fall back to login.live.com
                    this.bot.logger.warn(this.bot.isMobile, '登录', '从 chromewebdata 跳转至 baseURL 失败，重试登录页 login.live.com')

                    await page
                        .goto('https://login.live.com/', {
                            waitUntil: 'domcontentloaded',
                            timeout: 10000
                        })
                        .catch(() => {})

                    await this.bot.utils.wait(3000)
                    return true
                }
            }

            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, '登录', '需要 TOTP 双重认证')
                await this.totp2FALogin.handle(page, totpSecret)
                return true
            }

            case 'SIGN_IN_ANOTHER_WAY': {
                this.bot.logger.info(this.bot.isMobile, '登录', '选择“使用我的密码”')
                const passwordOption = '[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])'
                await this.bot.browser.utils.ghostClick(page, passwordOption)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'KMSI_PROMPT': {
                this.bot.logger.info(this.bot.isMobile, '登录', '接受 KMSI 提示')
                await this.bot.browser.utils.ghostClick(page, this.primaryButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'PASSKEY_VIDEO':
            case 'PASSKEY_ERROR': {
                this.bot.logger.info(this.bot.isMobile, '登录', '跳过 Passkey 提示')
                await this.bot.browser.utils.ghostClick(page, this.secondaryButtonSelector)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'LOGIN_PASSWORDLESS': {
                this.bot.logger.info(this.bot.isMobile, '登录', '处理无密码认证')
                await this.passwordlessLogin.handle(page)
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
                return true
            }

            case 'UNKNOWN': {
                const url = new URL(page.url())
                this.bot.logger.warn(this.bot.isMobile, '登录', `未知状态 | 主机=${url.hostname} | 路径=${url.pathname} | 等待中...`)
                return true
            }

            default:
                return true
        }
    }

    private async finalizeLogin(page: Page, email: string) {
        this.bot.logger.info(this.bot.isMobile, '登录', '正在完成登录流程')

        await page.goto(this.bot.config.baseURL, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

        const loginRewardsSuccess = new URL(page.url()).hostname === 'rewards.bing.com'
        if (loginRewardsSuccess) {
            this.bot.logger.info(this.bot.isMobile, '登录', '已成功登录 Microsoft Rewards')
        } else {
            this.bot.logger.warn(this.bot.isMobile, '登录', '无法验证 Rewards 仪表盘，默认视为登录有效')
        }

        await this.verifyBingSession(page)
        await this.getRewardsSession(page)

        const browser = page.context()
        const cookies = await browser.cookies()
        await saveSessionData(this.bot.config.sessionPath, cookies, email, this.bot.isMobile)

        this.bot.logger.info(this.bot.isMobile, '登录', '登录完成！会话已保存！')
    }

    async verifyBingSession(page: Page) {
        const url =
            'https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F'
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '正在验证 Bing 会话')

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                // Rare error state
                const state = await this.detectCurrentState(page)
                if (state === 'PASSKEY_ERROR') {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', '验证过程中进入 Passkey 错误状态，尝试关闭')
                    await this.bot.browser.utils.ghostClick(page, this.secondaryButtonSelector)
                }

                const u = new URL(page.url())
                const atBingHome = u.hostname === 'www.bing.com' && u.pathname === '/'

                if (atBingHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => {})

                    const signedIn = await page
                        .waitForSelector('#id_n', { timeout: 3000 })
                        .then(() => true)
                        .catch(() => false)

                    if (signedIn || this.bot.isMobile) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Bing 会话已建立')
                        return
                    }
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-BING', '重试后仍无法确认 Bing 会话，继续执行')
        } catch (error) {
            this.bot.logger.warn(
                this.bot.isMobile,
                'LOGIN-BING',
                `Bing 验证错误：${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async getRewardsSession(page: Page) {
        const loopMax = 5

        this.bot.logger.info(this.bot.isMobile, 'GET-REQUEST-TOKEN', '正在获取请求令牌')

        try {
            await page
                .goto(`${this.bot.config.baseURL}?_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 10000 })
                .catch(() => {})

            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed()) break

                this.bot.logger.debug(
                    this.bot.isMobile,
                    'GET-REWARD-SESSION',
                    `循环 ${i + 1}/${loopMax} | URL=${page.url()}`
                )

                const u = new URL(page.url())
                const atRewardHome = u.hostname === 'rewards.bing.com' && u.pathname === '/'

                if (atRewardHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page)

                    const html = await page.content()
                    const $ = await this.bot.browser.utils.loadInCheerio(html)

                    const token =
                        $('input[name="__RequestVerificationToken"]').attr('value') ??
                        $('meta[name="__RequestVerificationToken"]').attr('content') ??
                        null

                    if (token) {
                        this.bot.requestToken = token
                        this.bot.logger.info(this.bot.isMobile, 'GET-REQUEST-TOKEN', '请求令牌已设置！')

                        this.bot.logger.debug(
                            this.bot.isMobile,
                            'GET-REWARD-SESSION',
                            `已提取令牌：${token.substring(0, 10)}...`
                        )
                        return
                    }

                    this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', '页面未找到令牌')
                }

                await this.bot.utils.wait(1000)
            }

            this.bot.logger.warn(
                this.bot.isMobile,
                'GET-REQUEST-TOKEN',
                '未找到 RequestVerificationToken —— 部分活动可能无法运行'
            )
        } catch (error) {
            this.bot.logger.error(
                this.bot.isMobile,
                'GET-REQUEST-TOKEN',
                `奖励会话错误：${error instanceof Error ? error.message : String(error)}`
            )
            throw (error instanceof Error ? error : new Error(String(error)))
        }
    }

    async getAppAccessToken(page: Page, email: string) {
        return await new MobileAccessLogin(this.bot, page).get(email)
    }
}
