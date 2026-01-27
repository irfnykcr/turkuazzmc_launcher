const { app, BrowserWindow, ipcMain, dialog, session } = require('electron')
const path = require('path')
const Store = require('electron-store')
const { Client } = require('minecraft-launcher-core')
const msmc = require('msmc')
const os = require('os')
const fs = require('fs')

const store = new Store({
  defaults: {
	gamePath: process.platform === 'win32' 
	  ? path.join(process.env.APPDATA, '.minecraft') 
	  : path.join(os.homedir(), '.minecraft'),
	javaPath: 'java',
	ramAllocation: 2048,
	hideLauncher: false,
	exitAfterLaunch: false,
	auth: {
		type: 'offline',
		name: 'Steve',
		uuid: '00000000-0000-0000-0000-000000000000',
		access_token: '',
		client_token: '',
		user_properties: '{}'
	}
  }
})

store.reset() // --- DEBUG --- keep it

function writeLog(gamePath, message) {
	try {
		const logPath = path.join(gamePath, 'turkuazz_logs.txt')
		const timestamp = new Date().toLocaleString('en-US', { hour12: false })
		const logLine = `[${timestamp}] ${message}\n`
		fs.appendFileSync(logPath, logLine, 'utf8')
	} catch (e) {
		console.error('Failed to write log:', e)
	}
}


const launcher = new Client()
let win

const createWindow = () => {
  console.log('[STARTUP] Creating window...')
  win = new BrowserWindow({
	width: 1280,
	height: 720,
	webPreferences: {
	  preload: path.join(__dirname, 'preload.js'),
	  nodeIntegration: false,
	  contextIsolation: true
	}
  })

  win.setMenuBarVisibility(false)
  win.webContents.openDevTools()
  win.loadFile('views/index.html')
  console.log('[STARTUP] Window created')
}

app.on('ready', () => {
	console.log('[STARTUP] App ready')
	createWindow()
})

app.on('window-all-closed', () => {
	console.log('bye')
	app.quit()	
})

// --- IPC Handlers ---

ipcMain.handle('get-settings', () => {
	console.log('[get-settings] Called')
	
	let settings = {
		gamePath: store.get('gamePath'),
		javaPath: store.get('javaPath'),
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
})

ipcMain.handle('save-settings', (event, newSettings) => {
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
	
	return true
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

ipcMain.handle('get-versions', async () => {
	console.log('[get-versions] Called')
	try {
		console.log('[get-versions] Fetching manifest...')
		const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
		const data = await response.json()
		console.log('[get-versions] Received', data.versions ? data.versions.length : 0, 'versions')
		return data.versions
	} catch (error) {
		console.error('[get-versions] Failed to fetch versions:', error)
		return []
	}
})

ipcMain.handle('login-microsoft', async () => {
	try {
		await session.defaultSession.clearStorageData({
			storages: ['cookies', 'localstorage', 'caches']
		})

		const authManager = new msmc.Auth("select")
		const xboxManager = await authManager.launch("electron")
		const token = await xboxManager.getMinecraft()
		return {
			success: true,
			account: token.mclc()
		}
	} catch (err) {
		console.error("Login failed", err)
		return { success: false, error: err.message || JSON.stringify(err) }
	}
})

ipcMain.handle('launch-game', async (event, options) => {
	const instanceId = options.instanceId
	let type = "release"
	let versionNumber = options.version
	let customVersion = null

	if (/^\d+\.\d+(\.\d+)?$/.test(options.version)) {
		type = "release"
	} else if (/^\d{2}w\d{2}[a-z]$/.test(options.version)) {
		type = "snapshot"
	} else {
		type = "custom"
		try {
			const vPath = path.join(options.gamePath || store.get('gamePath'), 'versions', options.version, `${options.version}.json`)
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
	// we cant show access token in logs
	let _optswithoutaccesstoken = { ...opts }
	if (_optswithoutaccesstoken.authorization.access_token) {
		_optswithoutaccesstoken.authorization.access_token = '***'
	}
	console.log("Launching with options:", _optswithoutaccesstoken)
	_optswithoutaccesstoken = undefined

	const gamePath = options.gamePath || store.get('gamePath')
	const profileName = options.profileName || 'Unknown'
	const accountName = options.auth?.name || 'Unknown'
	
	writeLog(gamePath, `LAUNCH | Instance: ${instanceId} | Profile: ${profileName} | Version: ${options.version} | RAM: ${options.ram} | Account: ${accountName}`)

	const launcherInstance = new Client()
	launcherInstance.launch(opts)

	const hideLauncher = store.get('hideLauncher')
	const exitAfterLaunch = store.get('exitAfterLaunch')
	let hasHidden = false

	launcherInstance.on('debug', (e) => {
		const msg = e.toString()
		win.webContents.send('log', { instanceId, message: `[DEBUG] ${msg}` })
		writeLog(gamePath, `DEBUG | Instance: ${instanceId} | ${msg}`)
	})
	launcherInstance.on('data', (e) => {
		const msg = e.toString()
		win.webContents.send('log', { instanceId, message: msg })
		writeLog(gamePath, `DATA | Instance: ${instanceId} | ${msg}`)
		
		if (hideLauncher && !hasHidden) {
			if (msg.includes('Setting user:') || 
				msg.includes('LWJGL') || 
				msg.includes('OpenGL') ||
				msg.includes('Created: ')) {
				hasHidden = true
				if (exitAfterLaunch) {
					writeLog(gamePath, `EXIT | Instance: ${instanceId} | Fully exiting launcher`)
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
		writeLog(gamePath, `CLOSE | Instance: ${instanceId} | Exit Code: ${e}`)
		if (hideLauncher && hasHidden && !exitAfterLaunch) {
			win.show()
			console.log('[SHOW] Launcher restored - game closed')
		}
	})
	
	return true
})