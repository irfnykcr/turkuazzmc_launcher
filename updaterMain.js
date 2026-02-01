const { autoUpdater } = require('electron-updater')

class UpdateManager {
	constructor(mainWindow) { 
		this.mainWindow = mainWindow
		this.updateAvailable = false
		this.downloadInProgress = false
		this.updateInfo = null
		this.progressInterval = null
		this.SERVER_ENDPOINT = null
		this.setupAutoUpdater()
	}

	logger = {
		debug: (message) => {
			const timestamp = new Date().toISOString()
			console.log(`[updaterMain][DEBUG - ${timestamp}] ${message}`)
		},
		info: (message) => {
			const timestamp = new Date().toISOString()
			console.log(`[updaterMain][INFO - ${timestamp}] ${message}`)
		},
		error: (message) => {
			const timestamp = new Date().toISOString()
			console.error(`[updaterMain][ERROR - ${timestamp}] ${message}`)
		},
	}

	setServerEndpoint(endpoint) {
		this.SERVER_ENDPOINT = endpoint
		this.configureUpdateServer()
	}

	configureUpdateServer() {
		if (!this.SERVER_ENDPOINT) return

		autoUpdater.setFeedURL({
			provider: 'generic',
			url: `https://${this.SERVER_ENDPOINT}/turkuazzmc/`
		})
		
		this.logger.info(`Update server configured: https://${this.SERVER_ENDPOINT}/turkuazzmc/`)
	}

	setupAutoUpdater() {
		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = false
		autoUpdater.disableDifferentialDownload = true
		autoUpdater.disableWebInstaller = true

		autoUpdater.on('checking-for-update', () => {
			this.logger.info(`Checking for updates...`)
		})

		autoUpdater.on('update-available', (info) => {
			this.logger.info(`Update available: ${info.version}`)
			this.updateAvailable = true
			this.updateInfo = info
		})

		autoUpdater.on('update-not-available', (info) => {
			this.logger.info(`Update not available, current version: ${info.version}`)
		})

		autoUpdater.on('error', (err) => {
			this.logger.error(`Auto-updater error: ${err.message}`)
			if (this.mainWindow && this.mainWindow.webContents) {
				this.mainWindow.webContents.send('update-error', err.message)
			}
		})

		autoUpdater.on('download-progress', (progressObj) => {
			this.stopProgressSimulation()
			this.downloadInProgress = true
			const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`
			this.logger.info(logMessage)
			
			if (this.mainWindow && this.mainWindow.webContents) {
				const speed = this.formatBytes(progressObj.bytesPerSecond)
				const progressData = {
					percent: progressObj.percent || 0,
					text: `${Math.round(progressObj.percent || 0)}% - ${speed}/s`
				}
				this.logger.debug(`Sending update-progress to frontend: ${JSON.stringify(progressData)}`)
				this.mainWindow.webContents.send('update-progress', progressData)
			}
		})

		autoUpdater.on('update-downloaded', (info) => {
			this.logger.info(`Update downloaded: ${info.version}`)
			this.downloadInProgress = false
			this.stopProgressSimulation()
			
			if (this.mainWindow && this.mainWindow.webContents) {
				this.mainWindow.webContents.send('update-progress', {
					percent: 100,
					text: 'Download complete!'
				})
				
				setTimeout(() => {
					this.mainWindow.webContents.send('update-downloaded', info)
				}, 500)
			}
		})
	}

	async checkForUpdates() {
		try {
			if (!this.SERVER_ENDPOINT) {
				this.logger.warn(`Cannot check for updates: SERVER_ENDPOINT not set`)
				return false
			}

			const result = await autoUpdater.checkForUpdates()
			
			if (this.updateAvailable && this.updateInfo) {
				return true
			}
			
			return this.updateAvailable
		} catch (error) {
			this.logger.error(`Failed to check for updates: ${error.message}`)
			return false
		}
	}

	async installUpdate() {
		try {
			autoUpdater.quitAndInstall(true, false)
		} catch (error) {
			this.logger.error(`Failed to install update: ${error.message}`)
			return false
		}
	}

	async downloadUpdate() {
		try {
			if (!this.updateAvailable || !this.updateInfo) {
				await this.checkForUpdates()
			}
			
			this.logger.info(`Starting download update...`)
			if (this.mainWindow && this.mainWindow.webContents) {
				this.mainWindow.webContents.send('update-progress', {
					percent: 0,
					text: 'Starting download...'
				})
			}
			
			await autoUpdater.downloadUpdate()
			
			this.stopProgressSimulation()
			
			return true
		} catch (error) {
			this.logger.error(`Failed to download update: ${error.message}`)
			this.stopProgressSimulation()
			if (this.mainWindow && this.mainWindow.webContents) {
				this.mainWindow.webContents.send('update-error', error.message)
			}
			return false
		}
	}
	
	stopProgressSimulation() {
		if (this.progressInterval) {
			clearInterval(this.progressInterval)
			this.progressInterval = null
		}
	}

	getUpdateInfo() {
		return this.updateInfo
	}

	setMainWindow(mainWindow) {
		this.mainWindow = mainWindow
	}

	formatBytes(bytes) {
		if (bytes === 0) return '0 Bytes'
		const k = 1024
		const sizes = ['Bytes', 'KB', 'MB', 'GB']
		const i = Math.floor(Math.log(bytes) / Math.log(k))
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
	}
}

module.exports = UpdateManager