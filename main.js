const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const Store = require('electron-store')
const os = require('os')
const { registerHandlers } = require('./ipcHandlers')

// basic logger: [status, timestamp]
const logger = {
	debug: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[main][DEBUG - ${timestamp}] ${message}`)
  	},
	info: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[main][INFO - ${timestamp}] ${message}`)
	},
	error: (message) => {
		const timestamp = new Date().toISOString()
		console.error(`[main][ERROR - ${timestamp}] ${message}`)
	}
}


const store = new Store({
  defaults: {
	gamePath: process.platform === 'win32' 
	  ? path.join(process.env.APPDATA, '.minecraft') 
	  : path.join(os.homedir(), '.minecraft'),
	javaPath: 'java',
	javaArgs: '-Xmx4096M -Xms4096M',
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

let win

const createWindow = () => {
	logger.info(`[STARTUP] Creating window...`)
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
	if (!app.isPackaged) {
		win.webContents.openDevTools()
	}
	win.loadFile('views/index.html')
	logger.info(`[STARTUP] Window created`)
}

app.on('ready', async () => {
	logger.info(`[STARTUP] App ready`)

	try {
		const gamePath = store.get('gamePath') || (process.platform === 'win32' 
	  		? path.join(process.env.APPDATA, '.minecraft') 
	  		: path.join(os.homedir(), '.minecraft'))

		const logFile = path.join(gamePath, 'turkuazz_logs.txt')
		const rotatedLog = path.join(gamePath, 'turkuazz_logs.log.1')
		
		try {
			await require('fs').promises.access(logFile)
			
			const stats = await require('fs').promises.stat(logFile)
			if (stats.size > 10 * 1024 * 1024) {
				logger.info(`[STARTUP] Log file is too big (${(stats.size / 1024 / 1024).toFixed(2)}MB), deleting it`)
				await require('fs').promises.unlink(logFile)
			} else {
				try {
					await require('fs').promises.access(rotatedLog)
					await require('fs').promises.unlink(rotatedLog)
				} catch (e) {
					// rotated log probably doesn't exist
				}
				
				await require('fs').promises.rename(logFile, rotatedLog)
				logger.info(`[STARTUP] Rotated old log to ${rotatedLog}`)
			}
		} catch (e) {
			if (e.code !== 'ENOENT') {
				logger.error(`[STARTUP] Failed to rotate log: ${e.message}`)
			}
		}
	} catch (e) {
		logger.error(`[STARTUP] Log initialization error: ${e.message}`)
	}

	createWindow()
	registerHandlers(ipcMain, store, win)
	logger.info(`[STARTUP] IPC handlers registered`)
})

app.on('window-all-closed', () => {
	logger.info(`bye`)
	app.quit()	
})