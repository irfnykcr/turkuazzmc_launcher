const { BrowserWindow, dialog, session, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { Client } = require('minecraft-launcher-core')
const msmc = require('msmc')
const utils = require('./utils')

/*
	@param {import('electron').IpcMain} ipcMain
	@param {import('electron-store')} store
	@param {import('electron').BrowserWindow} win
*/
function registerHandlers(ipcMain, store, win) {
	
	ipcMain.handle('get-settings', async () => {
		console.log('[get-settings] Called')
		
		try {
			const javaPath = store.get('javaPath')
			const autoDetectedJava = javaPath === 'java' ? await utils.findJavaExecutable() : javaPath
			
			let settings = {
				gamePath: store.get('gamePath'),
				javaPath: autoDetectedJava,
				ramAllocation: store.get('ramAllocation'),
				hideLauncher: store.get('hideLauncher'),
				exitAfterLaunch: store.get('exitAfterLaunch'),
				profiles: [],
				auth: store.get('auth'),
				accounts: store.get('accounts') || []
			}
		
		console.log('[get-settings] gamePath:', settings.gamePath)
		
		try {
			const profilesPath = path.join(settings.gamePath, 'launcher_profiles.json')
			console.log('[get-settings] Looking for:', profilesPath)
			
			if (fs.existsSync(profilesPath)) {
				console.log('[get-settings] File exists, reading...')
				const content = fs.readFileSync(profilesPath, 'utf-8')
				const data = JSON.parse(content)
				const imported = []

				if (data.profiles) {
					console.log('[get-settings] Found profiles object, processing...')
					for (const [id, p] of Object.entries(data.profiles)) {
						console.log('[get-settings] Processing profile:', id, 'type:', p.type, 'version:', p.lastVersionId)
						
						if (p.type === 'latest-release' || p.type === 'latest-snapshot') {
							continue
						}

						if (p.lastVersionId) {
							imported.push({
								name: p.name || `Profile (${id.substring(0,6)})`,
								version: p.lastVersionId,
								type: 'offline', 
								auth: null
							})
						}
					}
					
					console.log('[get-settings] Imported count:', imported.length)
				}
				
				settings.profiles = imported
			} else {
				console.log('[get-settings] File does not exist')
			}
		} catch (e) {
			console.error('[get-settings] Failed to import profiles:', e)
		}
		
		console.log('[get-settings] Returning settings with', settings.profiles.length, 'profiles')
			return settings
		} catch (error) {
			console.error('[get-settings] Error:', error)
			return {
				gamePath: store.get('gamePath'),
				javaPath: 'java',
				ramAllocation: store.get('ramAllocation'),
				hideLauncher: store.get('hideLauncher'),
				exitAfterLaunch: store.get('exitAfterLaunch'),
				profiles: [],
				auth: store.get('auth'),
				accounts: store.get('accounts') || []
			}
		}
	})

	ipcMain.handle('save-settings', (event, newSettings) => {
		try {
			store.set('auth', newSettings.auth)
			store.set('accounts', newSettings.accounts)
			if (newSettings.gamePath) store.set('gamePath', newSettings.gamePath)
			if (newSettings.javaPath) store.set('javaPath', newSettings.javaPath)
			if (newSettings.ramAllocation !== undefined) store.set('ramAllocation', newSettings.ramAllocation)
			if (newSettings.hideLauncher !== undefined) store.set('hideLauncher', newSettings.hideLauncher)
			if (newSettings.exitAfterLaunch !== undefined) store.set('exitAfterLaunch', newSettings.exitAfterLaunch)
		
		if (newSettings.profiles && newSettings.profiles.length >= 0) {
			try {
				const gamePath = newSettings.gamePath || store.get('gamePath')
				const profilesPath = path.join(gamePath, 'launcher_profiles.json')
				
				let launcherData = { profiles: {} }
				
				if (fs.existsSync(profilesPath)) {
					const content = fs.readFileSync(profilesPath, 'utf-8')
					launcherData = JSON.parse(content)
					if (!launcherData.profiles) launcherData.profiles = {}
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
						lastUsed: new Date().toISOString()
					}
				})
				
				fs.writeFileSync(profilesPath, JSON.stringify(launcherData, null, 2), 'utf-8')
				console.log('[save-settings] Synced', newSettings.profiles.length, 'profiles to launcher_profiles.json')
			} catch (e) {
				console.error('[save-settings] Failed to sync to launcher_profiles.json:', e)
			}
		} else {
			console.log('[save-settings] No profiles provided, skipping launcher_profiles.json update')
		}
		
			return { success: true }
		} catch (error) {
			console.error('[save-settings] Error saving settings:', error)
			return { success: false, error: error.message }
		}
	})

	ipcMain.handle('select-folder', async () => {
		const result = await dialog.showOpenDialog({
			properties: ['openDirectory']
		})
		if (!result.canceled && result.filePaths.length > 0) {
			return result.filePaths[0]
		}
		return null
	})

	ipcMain.handle('get-installed-versions', async () => {
		console.log('[get-installed-versions] Called')
		try {
			const gamePath = store.get('gamePath')
			const versionsPath = path.join(gamePath, 'versions')
			
			if (!fs.existsSync(versionsPath)) {
				console.log('[get-installed-versions] Versions folder does not exist')
				return []
			}
			
			const versionDirs = fs.readdirSync(versionsPath).filter(dir => {
				const versionJsonPath = path.join(versionsPath, dir, `${dir}.json`)
				return fs.existsSync(versionJsonPath)
			})
			
			console.log('[get-installed-versions] Found', versionDirs.length, 'installed versions')
			return versionDirs
		} catch (error) {
			console.error('[get-installed-versions] Error:', error)
			return []
		}
	})

	ipcMain.handle('get-versions', async () => {
		console.log('[get-versions] Called')
		try {
			console.log('[get-versions] Fetching manifest...')
			const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
			
			const data = await response.json()
			console.log('[get-versions] Received', data.versions ? data.versions.length : 0, 'versions')
			return { success: true, versions: data.versions || [] }
		} catch (error) {
			console.error('[get-versions] Failed to fetch versions:', error)
			return { success: false, error: error.message, versions: [] }
		}
	})

	ipcMain.handle('check-disk-space', async () => {
		try {
			const gamePath = store.get('gamePath')
			const spaceInfo = utils.checkDiskSpace(gamePath)
			
			return {
				success: true,
				availableGB: (spaceInfo.available / (1024 * 1024 * 1024)).toFixed(2),
				requiredGB: (spaceInfo.required / (1024 * 1024 * 1024)).toFixed(2),
				hasSpace: spaceInfo.hasSpace
			}
		} catch (error) {
			console.error('[check-disk-space] Error:', error)
			return { success: false, error: error.message, hasSpace: true }
		}
	})

	ipcMain.handle('login-microsoft', async () => {
		try {
			console.log('[login-microsoft] Starting Microsoft login flow')
			await session.defaultSession.clearStorageData({
				storages: ['cookies', 'localstorage', 'caches']
			})
			
			const authManager = new msmc.Auth("select")
			console.log('[login-microsoft] Launching auth window...')
			const xboxManager = await authManager.launch("electron")
			const token = await xboxManager.getMinecraft()
			const mclcToken = token.mclc()
			console.log('[login-microsoft] Login successful for user:', mclcToken.name)
			const r = {
				success: true,
				account: {
					type: 'ms',
					access_token: mclcToken.access_token,
					client_token: mclcToken.client_token,
					uuid: mclcToken.uuid,
					name: mclcToken.name,
					user_properties: mclcToken.user_properties || {},
					meta: mclcToken.meta || {},
					refresh_token: token.refresh || token.mcToken?.refresh_token || null,
					expires_at: Date.now() + (3600 * 1000)
				}
			}
			return JSON.parse(JSON.stringify(r)) 
		} catch (err) {
			console.error("Login failed", err)
			return { success: false, error: err.message || JSON.stringify(err) }
		}
	})

	ipcMain.handle('refresh-microsoft-token', async (event, account) => {
		try {
			if (!account.refresh_token) {
				throw new Error('No refresh token available')
			}
			
			const authManager = new msmc.Auth("select")
			const token = await msmc.refresh(account.refresh_token, authManager)
			const mclcToken = token.mclc()
			const r = {
				success: true,
				account: {
					type: 'ms',
					access_token: mclcToken.access_token,
					client_token: mclcToken.client_token,
					uuid: mclcToken.uuid,
					name: mclcToken.name,
					user_properties: mclcToken.user_properties || {},
					meta: mclcToken.meta || {},
					refresh_token: token.refresh || token.mcToken?.refresh_token || null,
					expires_at: Date.now() + (3600 * 1000)
				}
			}
			return JSON.parse(JSON.stringify(r)) 
		} catch (err) {
			console.error('[refresh-token] Failed:', err)
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
			let type = "release"
			let versionNumber = options.version
			let customVersion = null
			
			const gamePath = options.gamePath || store.get('gamePath')

			if (options.auth.type === 'ms' && options.auth.expires_at) {
				if (Date.now() >= options.auth.expires_at - (5 * 60 * 1000)) {
					console.log('[launch-game] Token expired or expiring soon, refreshing...')
					utils.writeLog(gamePath, `INFO | Instance: ${instanceId} | Refreshing expired token`)
					
					try {
						const authManager = new msmc.Auth("select")
						const token = await msmc.refresh(options.auth.refresh_token, authManager)
						const mclcToken = token.mclc()
						const newAuth = {
							type: 'ms',
							access_token: mclcToken.access_token,
							client_token: mclcToken.client_token,
							uuid: mclcToken.uuid,
							name: mclcToken.name,
							user_properties: mclcToken.user_properties || {},
							meta: mclcToken.meta || {},
							refresh_token: token.refresh || token.mcToken?.refresh_token || null,
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
						console.error('[launch-game] Token refresh failed:', refreshErr)
						utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | Token refresh failed: ${refreshErr.message}`)
						return { success: false, error: 'Authentication expired. Please login again.' }
					}
				}
			}
			
			const spaceCheck = utils.checkDiskSpace(gamePath)
			if (!spaceCheck.hasSpace) {
				const availableGB = (spaceCheck.available / (1024 * 1024 * 1024)).toFixed(2)
				const requiredGB = (spaceCheck.required / (1024 * 1024 * 1024)).toFixed(2)
				const errorMsg = `Insufficient disk space: ${availableGB}GB available, ${requiredGB}GB required`
				utils.writeLog(gamePath, `ERROR | Instance: ${instanceId} | ${errorMsg}`)
				return { success: false, error: errorMsg }
			}

			if (/^\d+\.\d+(\.\d+)?$/.test(options.version)) {
				type = "release"
			} else if (/^\d{2}w\d{2}[a-z]$/.test(options.version)) {
				type = "snapshot"
			} else {
				type = "custom"
				try {
					const vPath = path.join(gamePath, 'versions', options.version, `${options.version}.json`)
					if (fs.existsSync(vPath)) {
						const vData = JSON.parse(fs.readFileSync(vPath, 'utf8'))
						if (vData.inheritsFrom) {
							customVersion = options.version
							versionNumber = vData.inheritsFrom
							type = "release"
							console.log(`Detected inheritance: ${customVersion} inherits from ${versionNumber}`)
						}
					}
				} catch (e) {
					console.warn("Failed to check version inheritance:", e)
					utils.writeLog(gamePath, `WARN | Instance: ${instanceId} | Failed to parse version JSON: ${e.message}`)
				}
			}

		const opts = {
			clientPackage: null,
			authorization: options.auth,
			root: options.gamePath || store.get('gamePath'),
			version: {
				number: versionNumber,
				type: type,
				custom: customVersion
			},
			memory: {
				max: options.ram || "2G",
				min: options.ram || "2G"
			},
			javaPath: options.javaPath || store.get('javaPath') || 'java'
		}

		//debug: mask sensitive info
		let _optswithoutaccesstoken = JSON.parse(JSON.stringify(opts))
		if (_optswithoutaccesstoken.authorization.access_token) {
			_optswithoutaccesstoken.authorization.access_token = '***'
		}
		if (_optswithoutaccesstoken.authorization.refresh_token) {
			_optswithoutaccesstoken.authorization.refresh_token = '***'
		}
		if (_optswithoutaccesstoken.authorization.client_token) {
			_optswithoutaccesstoken.authorization.client_token = '***'
		}
		// if (_optswithoutaccesstoken.authorization.uuid) {
		// 	_optswithoutaccesstoken.authorization.uuid = '***'
		// }
		console.log("Launching with options:", _optswithoutaccesstoken)
		_optswithoutaccesstoken = undefined
		//end debug


		const profileName = options.profileName || 'Unknown'
		const accountName = options.auth?.name || 'Unknown'
		
		utils.writeLog(gamePath, `LAUNCH | Instance: ${instanceId} | Profile: ${profileName} | Version: ${options.version} | RAM: ${options.ram} | Account: ${accountName}`)

		const launcherInstance = new Client()
		launcherInstance.launch(opts)

		const hideLauncher = store.get('hideLauncher')
		const exitAfterLaunch = store.get('exitAfterLaunch')
		let hasHidden = false


		//debug: mask sensitive info in logs
		launcherInstance.on('debug', (e) => {
			let msg = e.toString()
			if (msg.includes('--accessToken')) {
				msg = msg.replace(/--accessToken [^\s,}]+/g, '--accessToken ***')
			}
			if (msg.includes('--clientId')) {
				msg = msg.replace(/--clientId [^\s,}]+/g, '--clientId ***')
			}
			if (msg.includes('--xuid')) {
				msg = msg.replace(/--xuid [^\s,}]+/g, '--xuid ***')
			}
			if (msg.includes('--uuid')) {
				msg = msg.replace(/--uuid [^\s,}]+/g, '--uuid ***')
			}
			win.webContents.send('log', { instanceId, message: `[DEBUG] ${msg}` })
			utils.writeLog(gamePath, `DEBUG | Instance: ${instanceId} | ${msg}`)
		})
		//end debug


		launcherInstance.on('data', (e) => {
			const msg = e.toString()
			win.webContents.send('log', { instanceId, message: msg })
			utils.writeLog(gamePath, `DATA | Instance: ${instanceId} | ${msg}`)
			
			if (hideLauncher && !hasHidden) {
				if (msg.includes('Setting user:') || 
					msg.includes('LWJGL') || 
					msg.includes('OpenGL') ||
					msg.includes('Created: ')) {
					hasHidden = true
					if (exitAfterLaunch) {
						utils.writeLog(gamePath, `EXIT | Instance: ${instanceId} | Fully exiting launcher`)
						console.log('[EXIT] Fully exiting launcher - game started')
						app.quit()
					} else {
						win.hide()
						console.log('[HIDE] Launcher hidden - game started')
					}
				}
			}
		})
			launcherInstance.on('close', (e) => {
				win.webContents.send('log', { instanceId, message: `[CLOSE] Game closed with code ${e}` })
				utils.writeLog(gamePath, `CLOSE | Instance: ${instanceId} | Exit Code: ${e}`)
				if (hideLauncher && hasHidden && !exitAfterLaunch) {
					win.show()
					console.log('[SHOW] Launcher restored - game closed')
				}
			})
			
			return { success: true }
		} catch (error) {
			console.error('[launch-game] Error:', error)
			const gamePath = options.gamePath || store.get('gamePath')
			utils.writeLog(gamePath, `ERROR | Instance: ${options.instanceId} | Launch failed: ${error.message}`)
			return { success: false, error: error.message }
		}
	})
}

module.exports = { registerHandlers }
