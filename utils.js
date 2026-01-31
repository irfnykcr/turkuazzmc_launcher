const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')
const { exec } = require('child_process')
const execAsync = promisify(exec)

const logger = {
	debug: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[utils][DEBUG - ${timestamp}] ${message}`)
	},
	info: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[utils][INFO - ${timestamp}] ${message}`)
	},
	error: (message) => {
		const timestamp = new Date().toISOString()
		console.error(`[utils][ERROR - ${timestamp}] ${message}`)
	}
}

/*
	@param {string} gamePath
	@param {string} message
*/
function writeLog(gamePath, message) {
	try {
		const logPath = path.join(gamePath, 'turkuazz_logs.txt')
		const timestamp = new Date().toLocaleString('en-US', { hour12: false })
		const logLine = `[${timestamp}] ${message}\n`
		fs.appendFileSync(logPath, logLine, 'utf8')
	} catch (e) {
		logger.error(`Failed to write log: ${e.message}`)
	}
}

/*
	@return {Promise<string>} Path to Java executable
*/
async function findJavaExecutable() {
	const platform = process.platform
	const javaPaths = []
	
	try {
		const { stdout } = await execAsync(platform === 'win32' ? 'where java' : 'which java')
		if (stdout.trim()) {
			javaPaths.push(stdout.trim().split('\n')[0])
		}
	} catch (e) {
		logger.info(`[JAVA] System Java not found in PATH`)
	}
	
	if (platform === 'win32') {
		const commonPaths = [
			path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
			path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Java'),
			path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium')
		]
		
		for (const basePath of commonPaths) {
			try {
				if (fs.existsSync(basePath)) {
					const dirs = fs.readdirSync(basePath)
					for (const dir of dirs) {
						const javaExe = path.join(basePath, dir, 'bin', 'java.exe')
						if (fs.existsSync(javaExe)) {
							javaPaths.push(javaExe)
						}
					}
				}
			} catch (e) {
				logger.info(`[JAVA] Failed to scan ${basePath}`)
			}
		}
	} else if (platform === 'linux') {
		const commonPaths = [
			'/usr/lib/jvm',
			'/usr/java',
			'/opt/java',
			path.join(os.homedir(), '.jdks')
		]
		
		for (const basePath of commonPaths) {
			try {
				if (fs.existsSync(basePath)) {
					const dirs = fs.readdirSync(basePath)
					for (const dir of dirs) {
						const javaExe = path.join(basePath, dir, 'bin', 'java')
						if (fs.existsSync(javaExe)) {
							javaPaths.push(javaExe)
						}
					}
				}
			} catch (e) {
				logger.info(`[JAVA] Failed to scan ${basePath}`)
			}
		}
	}
	
	if (javaPaths.length > 0) {
		logger.info(`[JAVA] Found Java installations: ${javaPaths.join(', ')}`)
		return javaPaths[0]
	}
	
	logger.info(`[JAVA] No Java found, defaulting to "java"`)
	return 'java'
}

/*
	@param {string} gamePath
	@return {{ available: number, required: number, hasSpace: boolean }}
*/
function checkDiskSpace(gamePath) {
	try {
		const stats = fs.statfsSync ? fs.statfsSync(gamePath) : null
		if (!stats) {
			return { available: Infinity, required: 2 * 1024 * 1024 * 1024, hasSpace: true }
		}
		
		const availableBytes = stats.bavail * stats.bsize
		const requiredBytes = 2 * 1024 * 1024 * 1024
		
		return {
			available: availableBytes,
			required: requiredBytes,
			hasSpace: availableBytes >= requiredBytes
		}
	} catch (e) {
		logger.error(`[DISK] Failed to check disk space: ${e.message}`)
		return { available: Infinity, required: 2 * 1024 * 1024 * 1024, hasSpace: true }
	}
}

module.exports = {
	writeLog,
	findJavaExecutable,
	checkDiskSpace
}