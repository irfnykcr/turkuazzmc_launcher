const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
	loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
	refreshMicrosoftToken: (account) => ipcRenderer.invoke('refresh-microsoft-token', account),
	cancelMicrosoftLogin: () => ipcRenderer.invoke('cancel-microsoft-login'),
	launch: (options) => ipcRenderer.invoke('launch-game', options),
	getSettings: () => ipcRenderer.invoke('get-settings'),
	saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
	getVersions: () => ipcRenderer.invoke('get-versions'),
	getInstalledVersions: () => ipcRenderer.invoke('get-installed-versions'),
	checkDiskSpace: () => ipcRenderer.invoke('check-disk-space'),
	selectFolder: () => ipcRenderer.invoke('select-folder'),
	onLog: (callback) => ipcRenderer.on('log', (event, data) => callback(data)),
	onTokenRefreshed: (callback) => ipcRenderer.on('token-refreshed', (event, data) => callback(data)),

	// updater: download-update, install-update
	downloadUpdate: () => ipcRenderer.invoke('download-update'),
	installUpdate: () => ipcRenderer.invoke('install-update'),
})
