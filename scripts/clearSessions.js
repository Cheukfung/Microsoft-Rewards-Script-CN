import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

const possibleConfigPaths = [
    path.join(projectRoot, 'config.json'),
    path.join(projectRoot, 'src', 'config.json'),
    path.join(projectRoot, 'dist', 'config.json')
]

console.log('[调试] 项目根目录:', projectRoot)
console.log('[调试] 正在查找 config.json...')

let configPath = null
for (const p of possibleConfigPaths) {
    console.log('[调试] 检查路径:', p)
    if (fs.existsSync(p)) {
        configPath = p
        console.log('[调试] 已找到配置文件:', p)
        break
    }
}

if (!configPath) {
    console.error('[错误] 未在预期位置找到 config.json!')
    console.error('[错误] 已搜索路径:', possibleConfigPaths)
    process.exit(1)
}

console.log('[信息] 使用的配置文件:', configPath)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

if (!config.sessionPath) {
    console.error("[错误] config.json 缺少 'sessionPath' 键!")
    process.exit(1)
}

console.log('[信息] 配置中的会话路径:', config.sessionPath)

const configDir = path.dirname(configPath)
const possibleSessionDirs = [
    path.resolve(configDir, config.sessionPath),
    path.join(projectRoot, 'src/browser', config.sessionPath),
    path.join(projectRoot, 'dist/browser', config.sessionPath)
]

console.log('[调试] 正在查找会话目录...')

let sessionDir = null
for (const p of possibleSessionDirs) {
    console.log('[调试] 检查路径:', p)
    if (fs.existsSync(p)) {
        sessionDir = p
        console.log('[调试] 已找到会话目录:', p)
        break
    }
}

if (!sessionDir) {
    sessionDir = path.resolve(configDir, config.sessionPath)
    console.log('[调试] 使用回退的会话目录:', sessionDir)
}

const normalizedSessionDir = path.normalize(sessionDir)
const normalizedProjectRoot = path.normalize(projectRoot)

if (!normalizedSessionDir.startsWith(normalizedProjectRoot)) {
    console.error('[错误] 会话目录位于项目根目录之外!')
    console.error('[错误] 项目根目录:', normalizedProjectRoot)
    console.error('[错误] 会话目录:', normalizedSessionDir)
    process.exit(1)
}

if (normalizedSessionDir === normalizedProjectRoot) {
    console.error('[错误] 会话目录不能为项目根目录!')
    process.exit(1)
}

const pathSegments = normalizedSessionDir.split(path.sep)
if (pathSegments.length < 3) {
    console.error('[错误] 会话路径过于顶层（安全检查失败）!')
    console.error('[错误] 路径:', normalizedSessionDir)
    process.exit(1)
}

if (fs.existsSync(sessionDir)) {
    console.log('[信息] 正在删除会话文件夹:', sessionDir)
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true })
        console.log('[成功] 会话文件夹删除成功')
    } catch (error) {
        console.error('[错误] 删除会话文件夹失败:', error.message)
        process.exit(1)
    }
} else {
    console.log('[信息] 会话文件夹不存在:', sessionDir)
}

console.log('[信息] 完成。')
