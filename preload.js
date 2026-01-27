const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
	loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
	launch: (options) => ipcRenderer.invoke('launch-game', options),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
	getVersions: () => ipcRenderer.invoke('get-versions'),
	selectFolder: () => ipcRenderer.invoke('select-folder'),
	onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data))
})
