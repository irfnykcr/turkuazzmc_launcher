const fs = require('fs')
const path = require('path')
const os = require('os')
const { promisify } = require('util')
const { exec } = require('child_process')
const { launch } = require('@xmcl/core')
const extractZip = require('extract-zip')
const tar = require('tar')
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
	@param {string} version
	@param {number} globalRam
	@returns {void}
*/
async function extractArchive(src, dest) {
	if (src.endsWith('.zip')) {
		await extractZip(src, { dir: dest })
	} else if (src.endsWith('.tar.gz') || src.endsWith('.tgz')) {
		await fs.promises.mkdir(dest, { recursive: true })
		await tar.x({ file: src, cwd: dest })
	} else {
		throw new Error(`Unsupported archive format: ${src}`)
	}
}

/*
	@param {string} gamePath
	@param {string} version
	@returns {Promise<string>} Path to the java executable
*/
async function ensureBundledJava(gamePath, version) {
	const platform = process.platform
	const bundleDir = path.join(gamePath, 'bundled_java', version)
	
	let javaExe
	if (platform === 'win32') {
		javaExe = path.join(bundleDir, 'bin', 'java.exe')
	} else if (platform === 'darwin') {
		javaExe = path.join(bundleDir, 'Contents', 'Home', 'bin', 'java')
	} else {
		javaExe = path.join(bundleDir, 'bin', 'java')
	}

	if (fs.existsSync(javaExe)) {
		return javaExe
	}

	const osMap = {
		win32: 'windows',
		linux: 'linux'
	}
	const osName = osMap[platform] || 'linux'
	
	const apiUrl = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?os=${osName}&architecture=x64&image_type=jre`
	
	logger.info(`[JAVA] Fetching Java ${version} from ${apiUrl}`)
	const res = await fetch(apiUrl)
	if (!res.ok) throw new Error(`Failed to fetch Java info: ${res.statusText}`)
	
	const data = await res.json()
	if (!data || data.length === 0) throw new Error(`No Java ${version} found for ${osName}`)
	
	const pkg = data[0].binary.package
	const downloadUrl = pkg.link
	const archiveName = pkg.name
	
	const tmpArchive = path.join(gamePath, 'bundled_java', archiveName)
	
	logger.info(`[JAVA] Downloading Java ${version} from ${downloadUrl}`)
	await downloadToFile(downloadUrl, tmpArchive)
	
	logger.info(`[JAVA] Extracting Java ${version} to ${bundleDir}`)
	const extractDir = path.join(gamePath, 'bundled_java', `tmp_${version}`)
	await extractArchive(tmpArchive, extractDir)
	
	const dirs = await fs.promises.readdir(extractDir)
	if (dirs.length === 1) {
		await fs.promises.rename(path.join(extractDir, dirs[0]), bundleDir)
		await fs.promises.rmdir(extractDir)
	} else {
		await fs.promises.rename(extractDir, bundleDir)
	}
	
	await fs.promises.unlink(tmpArchive)
	
	if (platform !== 'win32') {
		await execAsync(`chmod +x "${javaExe}"`)
	}
	
	return javaExe
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
	ensureBundledJava,
	checkDiskSpace,
	launch_safe,
}