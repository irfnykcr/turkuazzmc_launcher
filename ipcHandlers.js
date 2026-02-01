const { BrowserWindow, dialog, session, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { launch, createMinecraftProcessWatcher } = require('@xmcl/core')
const msmc = require('msmc')
const utils = require('./utils')
const UpdateManager = require('./updaterMain.js')
const { autoUpdater } = require('electron-updater')

const logger = {
	debug: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[ipcHandlers][DEBUG - ${timestamp}] ${message}`)
	},
	info: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[ipcHandlers][INFO - ${timestamp}] ${message}`)
	},
	error: (message) => {
		const timestamp = new Date().toISOString()
		console.error(`[ipcHandlers][ERROR - ${timestamp}] ${message}`)
	}
}

const activeGameProcesses = new Map()

/*
	@param {import('electron').IpcMain} ipcMain
	@param {import('electron-store')} store
	@param {import('electron').BrowserWindow} win
*/
function registerHandlers(ipcMain, store, win) {
	
	const updateManager = new UpdateManager(win)
	updateManager.setServerEndpoint(store.get('updateServerEndpoint', 'updates.turkuazz.vip'))
	
	updateManager.checkForUpdates().then((hasUpdate) => {
		try {
			if (!hasUpdate) {
				logger.info(`No update available`)
				return
			}
			
			const updateInfo = updateManager.getUpdateInfo()
			if (!updateInfo || !updateInfo.version) {
				logger.error(`Update available but info is missing/invalid, skipping`)
				return
			}

			if (autoUpdater.currentVersion.compare(updateInfo.version) >= 0) {
				logger.info(`Current version is same or newer than update, skipping`)
				return
			}

			if (!app.isPackaged) {
				logger.info(`Update available, but in development mode - skipping update page`)
				return
			}
			logger.info(`Update available, showing update page...`)
			win.loadFile(path.join(__dirname, 'views/updater.html'))
		} catch (err) {
			logger.error(`Error in update handling: ${err.message}`)
		}
		return
	}).catch((err) => {
		logger.error(`Failed to check for updates: ${err.message}`)
	})

	

	ipcMain.handle('get-installed-versions', async () => {
		try {
			const gamePath = store.get('gamePath')
			const versionsPath = path.join(gamePath, 'versions')
			
			try {
				await fs.promises.access(versionsPath)
			} catch (e) {
				return { success: true, versions: [] }
			}

			const dirs = await fs.promises.readdir(versionsPath, { withFileTypes: true })
			const installedVersions = []

			for (const dir of dirs) {
				if (dir.isDirectory()) {
					const versionId = dir.name
					const jsonPath = path.join(versionsPath, versionId, `${versionId}.json`)
					const jarPath = path.join(versionsPath, versionId, `${versionId}.jar`)
					
					try {
						await fs.promises.access(jsonPath)
						// Check if jar exists (optional, but good for validity)
						await fs.promises.access(jarPath)
						
						const content = await fs.promises.readFile(jsonPath, 'utf8')
						const vJson = JSON.parse(content)
						
						installedVersions.push({
							id: versionId,
							type: vJson.type || 'custom',
							time: vJson.time || new Date().toISOString(),
							releaseTime: vJson.releaseTime || new Date().toISOString()
						})
					} catch (e) {
						// Not a valid version dir
					}
				}
			}
			
			return { success: true, versions: installedVersions }
		} catch (error) {
			logger.error(`[get-installed-versions] Error: ${error}`)
			return { success: false, error: error.message, versions: [] }
		}
	})

	ipcMain.handle('get-account-avatar', async (event, name) => {
		try {
			const { net } = require('electron')
			const cacheDir = path.join(app.getPath('userData'), 'cache', 'avatars')
			await fs.promises.mkdir(cacheDir, { recursive: true })
			
			const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '')
			const filePath = path.join(cacheDir, `${safeName}.png`)
			
			// Try reading from cache first
			try {
				await fs.promises.access(filePath)
				const data = await fs.promises.readFile(filePath, 'base64')
				return { success: true, data: `data:image/png;base64,${data}` }
			} catch (e) {
				// Cache miss
			}
			
			return new Promise((resolve) => {
				const request = net.request(`https://mc-heads.net/avatar/${name}`)
				request.on('response', (response) => {
					const chunks = []
					response.on('data', (chunk) => chunks.push(chunk))
					response.on('end', async () => {
						const buffer = Buffer.concat(chunks)
						try {
							if (response.statusCode === 200) {
								await fs.promises.writeFile(filePath, buffer)
							}
							const b64 = buffer.toString('base64')
							resolve({ success: true, data: `data:image/png;base64,${b64}` })
						} catch (e) {
							resolve({ success: false, error: e.message })
						}
					})
				})
				request.on('error', (e) => {
					resolve({ success: false, error: e.message })
				})
				request.end()
			})
		} catch (error) {
			logger.error(`[get-account-avatar] Error: ${error}`)
			return { success: false, error: error.message }
		}
	})

	ipcMain.handle('download-update', async (event) => {
		if (updateManager) {
			return await updateManager.downloadUpdate()
		}
		return false
	})

	ipcMain.handle('install-update', async (event) => {
		if (updateManager) {
			return await updateManager.installUpdate()
		}
		return false
	})




	ipcMain.handle('get-settings', async () => {
		logger.info(`[get-settings] Called`)
		
		try {
			const javaPath = store.get('javaPath')
			const autoDetectedJava = javaPath === 'java' ? await utils.findJavaExecutable() : javaPath
			
			let settings = {
				gamePath: store.get('gamePath'),
				javaPath: autoDetectedJava,
				ramMB: store.get('ramMB', 4096),
				javaArgs: store.get('javaArgs', '-Xmx4096M -Xms4096M'),
				hideLauncher: store.get('hideLauncher'),
				exitAfterLaunch: store.get('exitAfterLaunch'),
				auth: store.get('auth'),
				accounts: store.get('accounts') || [],
				profiles: []
			}
			
			// remove javaArgs.auth
			const safeDebugSettings = { ...settings }
			safeDebugSettings.auth = "***1"
			safeDebugSettings.accounts = "***2"

			logger.debug(`[get-settings] Settings loaded: ${JSON.stringify(safeDebugSettings)}`)
			
			const gamePath = settings.gamePath
			const profilesPath = path.join(gamePath, 'launcher_profiles.json')
			
			try {
				try {
					await fs.promises.access(profilesPath)
					logger.info(`[get-settings] File exists, reading...`)
					const content = await fs.promises.readFile(profilesPath, 'utf-8')
					const data = JSON.parse(content)
					const imported = []

					if (data.profiles) {
						logger.info(`[get-settings] Found profiles object, processing...`)
						for (const [id, p] of Object.entries(data.profiles)) {
							logger.debug(`[get-settings] Processing profile: ${id}, type: ${p.type}, version: ${p.lastVersionId}`)
							
							if (p.type === 'latest-release' || p.type === 'latest-snapshot') {
								continue
							}

							if (p.lastVersionId) {
								let isCustom = false;
								const versionId = p.lastVersionId;
								const isRelease = /^\d+\.\d+(\.\d+)?$/.test(versionId);
								const isSnapshot = /^\d{2}w\d{2}[a-z]$/.test(versionId);

								if (!isRelease && !isSnapshot) {
									const versionJsonPath = path.join(gamePath, 'versions', versionId, `${versionId}.json`);
									try {
										await fs.promises.access(versionJsonPath)
										const vJsonContent = await fs.promises.readFile(versionJsonPath, 'utf8')
										const vJson = JSON.parse(vJsonContent);
										if (vJson.inheritsFrom || vJson.type === 'custom') {
											isCustom = true;
										}
									} catch (e) {
										logger.debug(`[get-settings] Failed to check if custom: ${e}`);
									}
								}

								const profile = {
									name: p.name || `Profile (${id.substring(0,6)})`,
									version: p.lastVersionId,
									isCustom: isCustom
								}
								
								if (p.javaArgs || p.javaPath || p.ramMB) {
									profile.settings = {}
									if (p.javaArgs) profile.settings.javaArgs = p.javaArgs
									if (p.javaPath) profile.settings.javaPath = p.javaPath
									if (p.ramMB) profile.settings.ramMB = p.ramMB
								}
								
								imported.push(profile)
							}
						}
						
						logger.debug(`[get-settings] Imported profiles: ${JSON.stringify(imported)}`)
					}
					
					settings.profiles = imported
				} catch (err) {
					if (err.code === 'ENOENT') {
						logger.info(`[get-settings] File does not exist, creating it...`)
						try {
							await fs.promises.mkdir(gamePath, { recursive: true })
							await fs.promises.writeFile(profilesPath, JSON.stringify({
								profiles: {},
								settings: { crashAssistance: true, enableAdvanced: false },
								launcherVersion: { name: "1.0.0", format: 21 },
								authenticationDatabase: {}
							}, null, 2))
							logger.info(`[get-settings] Created new launcher_profiles.json`)
						} catch (createErr) {
							logger.error(`[get-settings] Failed to create launcher_profiles.json: ${createErr}`)
						}
					} else {
						throw err
					}
				}
			} catch (e) {
				logger.error(`[get-settings] Failed to read or parse launcher_profiles.json: ${e.message}`)
			}
			
			logger.info(`[get-settings] Returning settings with ${settings.profiles.length} profiles`)
			return settings
		} catch (error) {
			logger.error(`[get-settings] Error: ${error}`)
			return {
				gamePath: store.get('gamePath'),
				javaPath: 'java',
				ramMB: store.get('ramMB', 4096),
				hideLauncher: store.get('hideLauncher'),
				exitAfterLaunch: store.get('exitAfterLaunch'),
				profiles: [],
				auth: store.get('auth'),
				accounts: store.get('accounts') || []
			}
		}
	})

	ipcMain.handle('save-settings', async (event, newSettings) => {
		try {
			store.set('auth', newSettings.auth)
			store.set('accounts', newSettings.accounts)
			if (newSettings.gamePath) store.set('gamePath', newSettings.gamePath)
			if (newSettings.javaPath) store.set('javaPath', newSettings.javaPath)
			if (newSettings.ramMB !== undefined) store.set('ramMB', newSettings.ramMB)
			if (newSettings.javaArgs !== undefined) store.set('javaArgs', newSettings.javaArgs)
			if (newSettings.hideLauncher !== undefined) store.set('hideLauncher', newSettings.hideLauncher)
			if (newSettings.exitAfterLaunch !== undefined) store.set('exitAfterLaunch', newSettings.exitAfterLaunch)
		
		if (newSettings.profiles && newSettings.profiles.length >= 0) {
			try {
				const gamePath = newSettings.gamePath || store.get('gamePath')
				await fs.promises.mkdir(gamePath, { recursive: true })
				const profilesPath = path.join(gamePath, 'launcher_profiles.json')
				
				let launcherData = { profiles: {} }
				
				try {
					await fs.promises.access(profilesPath)
					const content = await fs.promises.readFile(profilesPath, 'utf-8')
					launcherData = JSON.parse(content)
					if (!launcherData.profiles) launcherData.profiles = {}
				} catch (err) {
					// Ignore if file doesn't exist
				}
				
				for (const [id, p] of Object.entries(launcherData.profiles)) {
					if (p.type === 'custom') {
						delete launcherData.profiles[id]
					}
				}
				
				newSettings.profiles.forEach(p => {
					const profileId = p.name.toLowerCase().replace(/\s+/g, '_')
					launcherData.profiles[profileId] = {
						name: p.name,
						type: 'custom',
						lastVersionId: p.version,
						created: new Date().toISOString(),
						lastUsed: new Date().toISOString(),
						ramMB: p.settings?.ramMB || null
					}
				})
			
				await fs.promises.writeFile(profilesPath, JSON.stringify(launcherData, null, 2), 'utf-8')
				logger.info(`[save-settings] Synced ${newSettings.profiles.length} profiles to launcher_profiles.json`)
			} catch (e) {
				logger.error(`[save-settings] Failed to sync to launcher_profiles.json: ${e}`)
			}
		} else {
		logger.info(`[save-settings] No profiles provided, skipping launcher_profiles.json update`)
	}
	
		return { success: true }
	} catch (error) {
		logger.error(`[save-settings] Error saving settings: ${error}`)
		return { success: false, error: error.message }
	}
	})

	ipcMain.handle('get-versions', async () => {
		logger.info(`[get-versions] Called`)
		try {
			logger.info(`[get-versions] Fetching manifest...`)
			const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
			
			const data = await response.json()
			logger.info(`[get-versions] Received ${data.versions ? data.versions.length : 0} versions`)
			return { success: true, versions: data.versions || [] }
		} catch (error) {
			logger.error(`[get-versions] Failed to fetch versions online: ${error}`)
			
			try {
				const gamePath = store.get('gamePath')
				const cachePaths = [
					path.join(gamePath, 'versions', 'version_manifest_v2.json'),
					path.join(gamePath, 'cache', 'json', 'version_manifest.json')
				]

				for (const cachePath of cachePaths) {
					try {
						await fs.promises.access(cachePath)
						logger.info(`[get-versions] Found local cache at: ${cachePath}`)
						const content = await fs.promises.readFile(cachePath, 'utf-8')
						const data = JSON.parse(content)
						if (data && data.versions) {
							logger.info(`[get-versions] Loaded ${data.versions.length} versions from cache`)
							return { success: true, versions: data.versions }
						}
					} catch (e) {
						// Continue to next path
					}
				}
				logger.warn(`[get-versions] No valid local cache found`)
			} catch (filesErr) {
				logger.error(`[get-versions] Error reading local cache: ${filesErr.message}`)
			}
			
			return { success: false, error: error.message, versions: [] }
		}
	})

	ipcMain.handle('check-disk-space', async () => {
		try {
			const gamePath = store.get('gamePath')
			const spaceInfo = await utils.checkDiskSpace(gamePath)
			
			return {
				success: true,
				availableGB: (spaceInfo.available / (1024 * 1024 * 1024)).toFixed(2),
				requiredGB: (spaceInfo.required / (1024 * 1024 * 1024)).toFixed(2),
				hasSpace: spaceInfo.hasSpace
			}
		} catch (error) {
			logger.error(`[check-disk-space] Error: ${error}`)
			return { success: false, error: error.message, hasSpace: true }
		}
	})

	ipcMain.handle('get-profile-data', async (event, { version, gamePath }) => {
		try {
			const result = { mods: [] }
			
			const modsPath = path.join(gamePath, 'mods')
			try {
				await fs.promises.access(modsPath)
				const modFiles = await fs.promises.readdir(modsPath)
				const jars = modFiles.filter(f => f.endsWith('.jar'))
				result.mods = jars.map(f => ({ name: f, path: path.join(modsPath, f) }))
			} catch (err) {
				// Ignore if mods folder doesn't exist
			}
			
			return { success: true, data: result }
		} catch (error) {
			logger.error(`[get-profile-data] Error: ${error}`)
			return { success: false, error: error.message }
		}
	})

	ipcMain.handle('login-microsoft', async () => {
		try {
			logger.info(`[login-microsoft] Starting Microsoft login flow`)
			// dont reset for debugging purposes - do not delete!
			// await session.defaultSession.clearStorageData({
			// 	storages: ['cookies', 'localstorage', 'caches']
			// })
			
			const authManager = new msmc.Auth("select")
			logger.info(`[login-microsoft] Launching auth window...`)
			const xboxManager = await authManager.launch("electron")
			const token = await xboxManager.getMinecraft()
			const mclcToken = token.mclc()
			logger.info(`[login-microsoft] Login successful for user: ${mclcToken.name}`)
			logger.debug(`[login-microsoft] Token object keys: ${Object.keys(token)}`)
			
			const refreshToken = xboxManager.msToken?.refresh_token || token.refresh || token.mcToken?.refresh_token || null
			logger.debug(`[login-microsoft] Refresh token: ${refreshToken ? 'found' : 'missing'}`)
			
			const r = {
				success: true,
				auth: {
					type: 'ms',
					access_token: mclcToken.access_token,
					client_token: mclcToken.client_token,
					uuid: mclcToken.uuid,
					name: mclcToken.name,
					user_properties: mclcToken.user_properties || {},
					meta: mclcToken.meta || {},
					refresh_token: refreshToken,
					expires_at: Date.now() + (3600 * 1000)
				}
			}
			return JSON.parse(JSON.stringify(r)) 
		} catch (err) {
			logger.error(`Login failed: ${err}`)
			return { success: false, error: err.message || JSON.stringify(err) }
		}
	})

	ipcMain.handle('refresh-microsoft-token', async (event, account) => {
		try {
			if (!account.refresh_token) {
				throw new Error('No refresh token available')
			}
			
			const authManager = new msmc.Auth("select")
			const xboxManager = await authManager.refresh(account.refresh_token)
			const token = await xboxManager.getMinecraft()
			const mclcToken = token.mclc()
			
			const refreshToken = xboxManager.msToken?.refresh_token || token.refresh || token.mcToken?.refresh_token || account.refresh_token
			
			const r = {
				success: true,
				auth: {
					type: 'ms',
					access_token: mclcToken.access_token,
					client_token: mclcToken.client_token,
					uuid: mclcToken.uuid,
					name: mclcToken.name,
					user_properties: mclcToken.user_properties || {},
					meta: mclcToken.meta || {},
					refresh_token: refreshToken,
					expires_at: Date.now() + (3600 * 1000)
				}
			}
			return JSON.parse(JSON.stringify(r)) 
		} catch (err) {
			logger.error(`[refresh-token] Failed: ${err}`)
			return { success: false, error: err.message || JSON.stringify(err) }
		}
	})

	ipcMain.handle('cancel-microsoft-login', () => {
		let cancelled = false
		BrowserWindow.getAllWindows().forEach((w) => {
			if (w !== win && (
					w.getTitle().includes('Microsoft') ||
					w.getTitle().includes('Sign')   ||
					w.getTitle().includes('Login')     ||
					w.getTitle().includes('Minecraft')
					)) {
				w.close()
				cancelled = true
			}
		})
		return { cancelled }
	})

	ipcMain.handle('launch-game', async (event, options) => {
		try {
			const instanceId = options.instanceId
			const gamePath = options.gamePath || store.get('gamePath')

			if (options.auth.type === 'ms' && options.auth.expires_at) {
				if (Date.now() >= options.auth.expires_at - (5 * 60 * 1000)) {
					logger.info(`[launch-game] Token expired or expiring soon, refreshing...`)
					logger.debug(`[launch-game] Has refresh_token: ${options.auth.refresh_token ? 'yes' : 'no'}`)
					utils.writeLog(gamePath, `INFO | Instance: ${instanceId} | Refreshing expired token`)
					
					if (!options.auth.refresh_token) {
						logger.error(`[launch-game] No refresh token available`)
						return { success: false, error: 'Microsoft account expired. Please remove and re-login in Account Manager.' }
					}
					
					try {
						const authManager = new msmc.Auth("select")
						const xboxManager = await authManager.refresh(options.auth.refresh_token)
						const token = await xboxManager.getMinecraft()
						const mclcToken = token.mclc()
						
						const refreshToken = xboxManager.msToken?.refresh_token || token.refresh || token.mcToken?.refresh_token || options.auth.refresh_token
						
						const newAuth = {
							type: 'ms',
							access_token: mclcToken.access_token,
							client_token: mclcToken.client_token,
							uuid: mclcToken.uuid,
							name: mclcToken.name,
							user_properties: mclcToken.user_properties || {},
							meta: mclcToken.meta || {},
							refresh_token: refreshToken,
							expires_at: Date.now() + (3600 * 1000)
						}

						options.auth = newAuth

						const accounts = store.get('accounts') || []
						const accIndex = accounts.findIndex(a => a.name === mclcToken.name && a.type === 'ms')
						if (accIndex !== -1) {
							accounts[accIndex] = options.auth
							store.set('accounts', accounts)
						}

						win.webContents.send('token-refreshed', options.auth)
						utils.writeLog(gamePath, `INFO | Instance: ${instanceId} | Token refreshed successfully`)
					} catch (refreshErr) {
						logger.error(`[launch-game] Token refresh failed: ${refreshErr.message || refreshErr.stack || JSON.stringify(refreshErr)}`)
						utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | Token refresh failed`)
						return { success: false, error: 'Microsoft account expired. Please remove and re-login in Account Manager.' }
					}
				}
			}
			
			const spaceCheck = await utils.checkDiskSpace(gamePath)
			if (!spaceCheck.hasSpace) {
				const availableGB = (spaceCheck.available / (1024 * 1024 * 1024)).toFixed(2)
				const requiredGB = (spaceCheck.required / (1024 * 1024 * 1024)).toFixed(2)
				const errorMsg = `Insufficient disk space: ${availableGB}GB available, ${requiredGB}GB required`
				utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | ${errorMsg}`)
				return { success: false, error: errorMsg }
			}

			const javaPath = options.profileSettings?.javaPath || options.javaPath || store.get('javaPath') || 'java'
			const javaExecutable = javaPath === 'java' ? await utils.findJavaExecutable() : javaPath
			
			if (!javaExecutable || javaExecutable === 'java') {
				const errorMsg = 'Java not found. Please install Java or configure Java path in settings.'
				utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | ${errorMsg}`)
				return { success: false, error: errorMsg }
			}
			
			if (!fs.existsSync(javaExecutable)) {
				const errorMsg = `Java executable not found at: ${javaExecutable}`
				utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | ${errorMsg}`)
				return { success: false, error: errorMsg }
			}

		const minecraftPath = options.profileSettings?.gamePath || options.gamePath || store.get('gamePath')
		const ramMB = options.profileSettings?.ramMB || 4096
		
		logger.info(`[launch-game] Using RAM: ${ramMB}MB from ${options.profileSettings?.ramMB ? 'profile' : 'global'}`)

		const opts = {
			gamePath: minecraftPath,
			javaPath: javaExecutable,
			version: options.version,
			minMemory: ramMB,
			maxMemory: ramMB,
			launcherName: 'Turkuazz Launcher',
			launcherBrand: 'turkuazz'
		}

		const uuidNoDashes = (options.auth.uuid || '').replace(/-/g, '')

		if (options.auth.type === 'ms') {
			opts.gameProfile = {
				name: options.auth.name,
				id: uuidNoDashes
			}
			opts.accessToken = options.auth.access_token
			opts.userType = 'mojang'
		} else {
			opts.gameProfile = {
				name: options.auth.name,
				id: uuidNoDashes
			}
			opts.accessToken = ''
			opts.userType = 'legacy'
		}

		let _optswithoutaccesstoken = JSON.parse(JSON.stringify(opts))
		if (_optswithoutaccesstoken.accessToken) {
			_optswithoutaccesstoken.accessToken = '***'
		}
		logger.info(`Launching with options: ${JSON.stringify(_optswithoutaccesstoken)}`)
		_optswithoutaccesstoken = undefined

		const profileName = options.profileName || 'Unknown'
		const accountName = options.auth?.name || 'Unknown'
		
		utils.writeLog(gamePath, `LAUNCH | Instance: ${instanceId} | Profile: ${profileName} | Version: ${options.version} | RAM: ${ramMB}MB | Account: ${accountName}`)

		const gameProcess = await launch(opts)

		activeGameProcesses.set(instanceId, gameProcess)

		const hideLauncher = store.get('hideLauncher')
		const exitAfterLaunch = store.get('exitAfterLaunch')
		let hasHidden = false

		const watcher = createMinecraftProcessWatcher(gameProcess)

		watcher.on('error', (err) => {
			logger.error(`[launch-game] Process error: ${err}`)
			win.webContents.send('log', { instanceId, message: `[ERROR] ${err}` })
			utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | ${err}`)
		})

		watcher.on('minecraft-window-ready', () => {
			logger.info(`[launch-game] Game window ready`)
			win.webContents.send('log', { instanceId, message: '[INFO] Game window ready' })
			utils.writeLog(gamePath, `INFO | Instance: ${instanceId} | Game window ready`)
			
			if (hideLauncher && !hasHidden) {
				hasHidden = true
				if (exitAfterLaunch) {
					utils.writeLog(gamePath, `EXIT | Instance: ${instanceId} | Fully exiting launcher`)
					logger.info(`[EXIT] Fully exiting launcher - game started`)
					app.quit()
				} else {
					win.hide()
					logger.info(`[HIDE] Launcher hidden - game started`)
				}
			}
		})

		watcher.on('minecraft-exit', (event) => {
			const { code, signal, crashReport, crashReportLocation } = event
			win.webContents.send('log', { instanceId, message: `[CLOSE] Game closed with code ${code}` })
			utils.writeLog(gamePath, `CLOSE | Instance: ${instanceId} | Exit Code: ${code}`)
			
			activeGameProcesses.delete(instanceId)
			
			if (crashReport) {
				win.webContents.send('log', { instanceId, message: `[CRASH] Report at: ${crashReportLocation}` })
				utils.writeLog(gamePath, `CRASH | Instance: ${instanceId} | Report: ${crashReportLocation}`)
			}

			if (hideLauncher && hasHidden && !exitAfterLaunch) {
				win.show()
				logger.info(`[SHOW] Launcher restored - game closed`)
			}
		})

		if (gameProcess.stdout) {
			gameProcess.stdout.on('data', (data) => {
				const msg = data.toString()
				win.webContents.send('log', { instanceId, message: msg })
				utils.writeLog(gamePath, `DATA | Instance: ${instanceId} | ${msg}`)
			})
		}

		if (gameProcess.stderr) {
			gameProcess.stderr.on('data', (data) => {
				const msg = data.toString()
				win.webContents.send('log', { instanceId, message: `[STDERR] ${msg}` })
				utils.writeLog(gamePath, `STDERR | Instance: ${instanceId} | ${msg}`)
			})
		}
			
			return { success: true }
		} catch (error) {
			logger.error(`[launch-game] Error: ${error}`)
			const gamePath = options.gamePath || store.get('gamePath')
			
			let userFriendlyError = error.message
			if (error.error === 'CorruptedVersionJar' || error.message?.includes('CorruptedVersionJar')) {
				userFriendlyError = `Version "${options.version}" is not installed or corrupted. Please install it first.`
			} else if (error.error === 'MissingLibraries' || error.message?.includes('MissingLibraries')) {
				userFriendlyError = `Missing game libraries for version "${options.version}". Please reinstall.`
			}
			
			utils.writeLog(gamePath, `ERROR | Instance: ${options.instanceId} | Launch failed: ${error.message}`)
			return { success: false, error: userFriendlyError }
		}
	})
}

module.exports = { registerHandlers }
