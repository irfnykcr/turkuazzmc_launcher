const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')
const { exec } = require('child_process')
const { launch } = require('@xmcl/core')
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
async function writeLog(gamePath, message) {
	try {
		const logPath = path.join(gamePath, 'turkuazz_logs.txt')
		const timestamp = new Date().toLocaleString('en-US', { hour12: false })
		const logLine = `[${timestamp}] ${message}\n`
		await fs.promises.appendFile(logPath, logLine, 'utf8')
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
	@return {Promise<{ available: number, required: number, hasSpace: boolean }>}
*/
async function checkDiskSpace(gamePath) {
	try {
		if (fs.promises.statfs) {
			const stats = await fs.promises.statfs(gamePath)
			const availableBytes = stats.bavail * stats.bsize
			const requiredBytes = 2 * 1024 * 1024 * 1024
			
			return {
				available: availableBytes,
				required: requiredBytes,
				hasSpace: availableBytes >= requiredBytes
			}
		} else {
			// Fallback for older node versions if necessary, or just use sync but wrapped
			const stats = fs.statfsSync(gamePath)
			const availableBytes = stats.bavail * stats.bsize
			const requiredBytes = 2 * 1024 * 1024 * 1024
			
			return {
				available: availableBytes,
				required: requiredBytes,
				hasSpace: availableBytes >= requiredBytes
			}
		}
	} catch (e) {
		logger.error(`[DISK] Failed to check disk space: ${e.message}`)
		return { available: Infinity, required: 2 * 1024 * 1024 * 1024, hasSpace: true }
	}
}

async function downloadToFile(url, destPath) {
	await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
	const tmpPath = `${destPath}.tmp_${Date.now()}`
	try {
		const res = await fetch(url)
		if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
		const buf = Buffer.from(await res.arrayBuffer())
		await fs.promises.writeFile(tmpPath, buf)
		await fs.promises.rename(tmpPath, destPath)
	} catch (e) {
		try { await fs.promises.unlink(tmpPath) } catch (_) {}
		throw e
	}
}

async function ensureVersionJsonAndJar(gamePath, versionId) {
	const versionDir = path.join(gamePath, 'versions', versionId)
	const versionJsonPath = path.join(versionDir, `${versionId}.json`)
	const versionJarPath = path.join(versionDir, `${versionId}.jar`)

	let versionJson
	try {
		versionJson = JSON.parse(await fs.promises.readFile(versionJsonPath, 'utf8'))
	} catch (_) {
		const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
		if (!manifestRes.ok) throw new Error(`HTTP ${manifestRes.status}: ${manifestRes.statusText}`)
		const manifest = await manifestRes.json()
		const entry = (manifest.versions || []).find(v => v.id === versionId)
		if (!entry?.url) throw new Error(`Version ${versionId} not found in manifest`)
		await downloadToFile(entry.url, versionJsonPath)
		versionJson = JSON.parse(await fs.promises.readFile(versionJsonPath, 'utf8'))
	}

	const clientUrl = versionJson?.downloads?.client?.url
	if (!clientUrl) throw new Error(`No client download URL in version json for ${versionId}`)
	try { await fs.promises.unlink(versionJarPath) } catch (_) {}
	await downloadToFile(clientUrl, versionJarPath)
}

async function ensureLibraries(basePath, libraries) {
	for (const lib of libraries || []) {
		const artifact = lib?.download
		if (!artifact?.path || !artifact?.url) continue
		const target = path.join(basePath, 'libraries', artifact.path)
		try { await fs.promises.unlink(target) } catch (_) {}
		await downloadToFile(artifact.url, target)
	}
}

function classifyLaunchError(e) {
	const msg = e?.message ? String(e.message) : ''
	return e?.error || (
		msg.includes('CorruptedVersionJar') || msg.toLowerCase().includes('corrupted version jar')
			? 'CorruptedVersionJar'
			: (msg.includes('MissingVersionJson')
				? 'MissingVersionJson'
				: ((msg.includes('MissingLibraries') || (msg.toLowerCase().includes('missing') && msg.toLowerCase().includes('libraries')))
					? 'MissingLibraries'
					: null))
	)
}

async function launch_safe(opts) {
	const gamePath = opts?.gamePath
	const versionId = opts?.version
	const basePath = opts?.resourcePath || opts?.gamePath

	try {
		return await launch(opts)
	} catch (e1) {
		const code1 = classifyLaunchError(e1)

		if ((code1 === 'CorruptedVersionJar' || code1 === 'MissingVersionJson') && gamePath && versionId) {
			await writeLog(gamePath, `INFO | Auto-downloading/repairing version ${versionId}`)
			await ensureVersionJsonAndJar(gamePath, versionId)
			try {
				return await launch(opts)
			} catch (e2) {
				const code2 = classifyLaunchError(e2)
				if (code2 === 'MissingLibraries' && Array.isArray(e2?.libraries) && e2.libraries.length && basePath) {
					await writeLog(gamePath, `INFO | Auto-downloading missing libraries (${e2.libraries.length})`)
					await ensureLibraries(basePath, e2.libraries)
					return await launch(opts)
				}
				throw e2
			}
		}

		if (code1 === 'MissingLibraries' && Array.isArray(e1?.libraries) && e1.libraries.length && basePath) {
			if (gamePath) {
				await writeLog(gamePath, `INFO | Auto-downloading missing libraries (${e1.libraries.length})`)
			}
			await ensureLibraries(basePath, e1.libraries)
			try {
				return await launch(opts)
			} catch (e2) {
				const code2 = classifyLaunchError(e2)
				if ((code2 === 'CorruptedVersionJar' || code2 === 'MissingVersionJson') && gamePath && versionId) {
					await writeLog(gamePath, `INFO | Auto-downloading/repairing version ${versionId}`)
					await ensureVersionJsonAndJar(gamePath, versionId)
					return await launch(opts)
				}
				throw e2
			}
		}

		throw e1
	}
}

module.exports = {
	writeLog,
	findJavaExecutable,
	checkDiskSpace,
	launch_safe,
}