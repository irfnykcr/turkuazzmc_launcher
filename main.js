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


// --- IPC Handlers ---

ipcMain.handle('get-settings', () => {
    console.log('[get-settings] Called')
    
    let settings = {
        gamePath: store.get('gamePath'),
        javaPath: store.get('javaPath'),
        ramAllocation: store.get('ramAllocation'),
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
			min: "1G"
		},
		javaPath: options.javaPath || store.get('javaPath') || 'java'
	}

	console.log("Launching with options:", opts)

	launcher.removeAllListeners('data')
	launcher.removeAllListeners('close')
	launcher.removeAllListeners('debug')

	launcher.launch(opts)

	launcher.on('debug', (e) => win.webContents.send('log', `[DEBUG] ${e}`))
	launcher.on('data', (e) => win.webContents.send('log', `${e}`))
	launcher.on('close', (e) => win.webContents.send('log', `[CLOSE] Game closed with code ${e}`))
	
	return true
})