const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const Store = require('electron-store')
const os = require('os')
const { registerHandlers } = require('./ipcHandlers')

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
	registerHandlers(ipcMain, store, win)
	console.log('[STARTUP] IPC handlers registered')
})

app.on('window-all-closed', () => {
	console.log('bye')
	app.quit()	
})