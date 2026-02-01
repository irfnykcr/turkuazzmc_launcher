

import { profiles, selectedProfileIndex, setProfiles, renderProfileList, selectProfile, showCreateProfile,
		addProfile, deleteProfile, handleEditProfile, updatePreview } from './profiles.js'

import { currentAuth, savedAccounts, setSavedAccounts, setCurrentAuth, getCurrentAuth, getMCLCAuth, updateAccountUI,
		renderAccountList, addAccountToState, removeAccountFromState, isCurrentAccount } from './accounts.js'

import { currentSettings, javaArgs, setCurrentSettings, setJavaArgs, getJavaArgs,
		getCurrentSettings, showSettings, closeSettings, browseGamePath, getSettingsFormData,
		setHideLauncher, setExitAfterLaunch } from './settings.js'

const logger = {
	debug: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[index][DEBUG - ${timestamp}] ${message}`)
  	},
	info: (message) => {
		const timestamp = new Date().toISOString()
		console.log(`[index][INFO - ${timestamp}] ${message}`)
	},
	error: (message) => {
		const timestamp = new Date().toISOString()
		console.error(`[index][ERROR - ${timestamp}] ${message}`)
	}
}

let versions = []
let instances = {}
let activeInstanceId = null
let isMicrosoftLoginInProgress = false

document.addEventListener('DOMContentLoaded', async () => {
	logger.info(`[FRONTEND] DOMContentLoaded`)
	setupEventListeners()

	logger.info(`[FRONTEND] Loading settings...`)
	await loadSettings()
	logger.info(`[FRONTEND] Settings loaded, profiles: ${profiles.length}`)
	
	logger.info(`[FRONTEND] Loading versions...`)
	await loadVersions()
	logger.info(`[FRONTEND] Versions loaded: ${versions.length}`)
	
	setupIpcListeners()
	
	updateOnlineStatus()
	window.addEventListener('online', () => {
		updateOnlineStatus()
		loadVersions()
	})
	window.addEventListener('offline', () => {
		updateOnlineStatus()
		loadVersions()
	})

	logger.info(`[FRONTEND] Initialization complete`)
})

function updateOnlineStatus() {
	const isOnline = navigator.onLine
	const statusMsg = document.getElementById('statusMessage')
	
	if (!isOnline) {
		showAlert('You are currently offline. Some features may be unavailable.', 'error')
		if (statusMsg) statusMsg.textContent = 'Offline Mode'
		document.body.classList.add('offline-mode')
	} else {
		if (statusMsg && statusMsg.textContent === 'Offline Mode') {
			statusMsg.textContent = 'Ready to launch'
		}
		document.body.classList.remove('offline-mode')
	}
}

/*
	@returns {void}
*/
function setupEventListeners() {
	document.getElementById('createProfileBtn').addEventListener('click', showCreateProfile)
	document.getElementById('profileForm').addEventListener('submit', handleSaveProfile)
	
	document.getElementById('closeModalBtn').addEventListener('click', () => {
		document.getElementById('profileModal').classList.add('hidden')
	})
	
	const accModal = document.getElementById('accountModal')
	const accOverlay = document.getElementById('accountModalOverlay')

	document.getElementById('accountSection').addEventListener('click', () => {
		accModal.classList.remove('hidden')
		renderAccountList()
		setTimeout(() => {
		   const input = document.getElementById('offlineNameInput')
		   if(input) {
			   input.focus() 
		   }
		}, 100)
	})
	
	const closeModal = () => {
		if (isMicrosoftLoginInProgress) {
			window.api.cancelMicrosoftLogin()
			isMicrosoftLoginInProgress = false
		}
		accModal.classList.add('hidden')
	}

	document.getElementById('closeAccountModalBtn').addEventListener('click', closeModal)
	accOverlay.addEventListener('click', (e) => {
		if (!isMicrosoftLoginInProgress) {
			closeModal()
		}
	})
	
	document.getElementById('msLoginBtn').addEventListener('click', () => performMicrosoftLogin())
	document.getElementById('setOfflineBtn').addEventListener('click', handleSetOfflineAccount)
	
	document.getElementById('launchBtn').addEventListener('click', launchGame)
	
	document.getElementById('showSnapshots').addEventListener('change', loadVersions)
	document.getElementById('showHistorical').addEventListener('change', loadVersions)

	document.getElementById('settingsBtn').addEventListener('click', showSettings)
	document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings)
	document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettings)
	document.getElementById('settingsModalOverlay').addEventListener('click', closeSettings)
	document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings)
	document.getElementById('browseGamePathBtn').addEventListener('click', browseGamePath)

	document.getElementById('hideLauncherCheckbox').addEventListener('change', (e) => {
		const exitCheckbox = document.getElementById('exitAfterLaunchCheckbox')
		exitCheckbox.disabled = !e.target.checked
		if (!e.target.checked) {
			exitCheckbox.checked = false
		}
	})

	document.getElementById('toggleProfileSettings').addEventListener('click', () => {
		const section = document.getElementById('profileSettingsSection')
		const arrow = document.getElementById('profileSettingsArrow')
		section.classList.toggle('hidden')
		arrow.classList.toggle('rotate-180')
	})
	
	document.getElementById('pRamSlider').addEventListener('input', (e) => {
		const value = parseInt(e.target.value)
		document.getElementById('pRamInput').value = value
	})
	
	document.getElementById('ramSlider').addEventListener('input', (e) => {
		const value = parseInt(e.target.value)
		document.getElementById('ramInput').value = value
	})

	document.getElementById('ramInput').addEventListener('input', (e) => {
		const value = parseInt(e.target.value)
		if (value >= 2048 && value <= 16384) {
			document.getElementById('ramSlider').value = value
		}
	})

	document.getElementById('pRamInput').addEventListener('input', (e) => {
		const value = parseInt(e.target.value)
		if (value >= 0 && value <= 16384) {
			document.getElementById('pRamSlider').value = value
		}
	})

	document.getElementById('previewTab').addEventListener('click', () => switchTab('preview'))
	document.getElementById('consoleTab').addEventListener('click', () => switchTab('console'))
	document.getElementById('editProfileBtn').addEventListener('click', handleEditProfile)
	document.getElementById('toggleLaunchVars').addEventListener('click', () => {
		const content = document.getElementById('launchVarsContent')
		const arrow = document.getElementById('launchVarsArrow')
		content.classList.toggle('hidden')
		arrow.classList.toggle('rotate-180')
	})

	setupConfirmModal()
	setupEscapeKeyHandler()
}

/*
	@returns {void}
*/
function setupEscapeKeyHandler() {
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			const settingsModal = document.getElementById('settingsModal')
			const accountModal = document.getElementById('accountModal')
			const profileModal = document.getElementById('profileModal')
			const confirmModal = document.getElementById('confirmModal')
			
			if (!settingsModal.classList.contains('hidden')) {
				closeSettings()
			} else if (!accountModal.classList.contains('hidden')) {
				if (!isMicrosoftLoginInProgress) {
					accountModal.classList.add('hidden')
				}
			} else if (!profileModal.classList.contains('hidden')) {
				profileModal.classList.add('hidden')
			} else if (!confirmModal.classList.contains('hidden')) {
				document.getElementById('confirmCancelBtn').click()
			}
		}
	})
}

/*
	@param {string} tab - 'preview' or 'console'
	@returns {void}
*/
function switchTab(tab) {
	const previewTab = document.getElementById('previewTab')
	const consoleTab = document.getElementById('consoleTab')
	const previewContent = document.getElementById('previewContent')
	const consoleContent = document.getElementById('consoleContent')

	if (tab === 'preview') {
		previewTab.classList.add('border-green-500', 'text-green-500')
		previewTab.classList.remove('border-transparent', 'text-neutral-400')
		consoleTab.classList.remove('border-green-500', 'text-green-500')
		consoleTab.classList.add('border-transparent', 'text-neutral-400')
		previewContent.classList.remove('hidden')
		consoleContent.classList.add('hidden')
	} else {
		consoleTab.classList.add('border-green-500', 'text-green-500')
		consoleTab.classList.remove('border-transparent', 'text-neutral-400')
		previewTab.classList.remove('border-green-500', 'text-green-500')
		previewTab.classList.add('border-transparent', 'text-neutral-400')
		consoleContent.classList.remove('hidden')
		previewContent.classList.add('hidden')
	}
}

let confirmCallback = null
/*
	@returns {void}
*/
function setupConfirmModal() {
	const modal = document.getElementById('confirmModal')
	const close = () => {
		modal.classList.add('hidden')
		confirmCallback = null
	}

	document.getElementById('confirmCancelBtn').onclick = close
	document.getElementById('confirmOkBtn').onclick = () => {
		modal.classList.add('hidden')
		if (confirmCallback) confirmCallback()
		confirmCallback = null
	}

	modal.addEventListener('click', (e) => {
		if (e.target === modal || e.target.classList.contains('backdrop-blur-sm')) {
			close()
		}
	})
}

/*
	@param {string} msg - The confirmation message
	@param {function} callback - The function to call if confirmed
	@returns {void}
*/
function showConfirm(msg, callback) {
	document.getElementById('confirmMessage').textContent = msg
	confirmCallback = callback
	document.getElementById('confirmModal').classList.remove('hidden')
}

/*
	@param {string} msg - The message to display
	@param {string} type - 'info' | 'success' | 'error'
	@returns {void}
*/
function showAlert(msg, type = 'info') {
	const container = document.getElementById('alertContainer')
	const alert = document.createElement('div')
	alert.className = 'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transform transition-all duration-300 opacity-0 translate-x-full'
	
	if (type === 'error') {
		alert.className += ' bg-red-900 border-red-700 text-red-100'
	} else if (type === 'success') {
		alert.className += ' bg-green-900 border-green-700 text-green-100'
	} else {
		alert.className += ' bg-neutral-800 border-neutral-600 text-neutral-100'
	}
	
	alert.innerHTML = `
		<span class="flex-1 text-sm">${msg}</span>
		<button class="text-current hover:opacity-70 text-xl font-bold leading-none">&times;</button>
	`
	
	container.appendChild(alert)
	
	const closeBtn = alert.querySelector('button')
	const removealert = () => {
		alert.classList.add('opacity-0', 'translate-x-full')
		setTimeout(() => alert.remove(), 300)
	}
	
	closeBtn.onclick = removealert
	
	setTimeout(() => {
		alert.classList.remove('opacity-0', 'translate-x-full')
	}, 10)
	
	setTimeout(removealert, 5000)
}





// Profile handlers
window.removeProfileHandler = async (index) => {
	const p = profiles[index]
	showConfirm(`Are you sure you want to delete profile "${p.name}"?`, async () => {
		deleteProfile(index)
		await saveAllSettings()
	})
}

/*
	@param {Event} e
	@returns {Promise<void>}
*/
async function handleSaveProfile(e) {
	e.preventDefault()
	const name = document.getElementById('pName').value
	const version = document.getElementById('pVersion').value
	
	const ramMB = parseInt(document.getElementById('pRamSlider').value)
	const javaPath = document.getElementById('pJavaPathInput').value.trim()
	const globalRam = currentSettings.ramMB || 4096
	const globalJavaPath = (currentSettings.javaPath || 'java').trim()
	
	const editingIndex = parseInt(document.getElementById('editingProfileIndex').value)
	const newProfile = { name, version }
	
	const hasJavaOverride = javaPath && javaPath !== globalJavaPath
	if (ramMB !== globalRam || hasJavaOverride) {
		newProfile.settings = {}
		if (ramMB !== globalRam) newProfile.settings.ramMB = ramMB
		if (hasJavaOverride) newProfile.settings.javaPath = javaPath
	}
	
	if (editingIndex >= 0) {
		profiles[editingIndex] = newProfile
		renderProfileList()
		selectProfile(editingIndex)
	} else {
		addProfile(newProfile)
	}
	
	await saveAllSettings()
	document.getElementById('profileModal').classList.add('hidden')
	
	document.getElementById('pRamSlider').value = globalRam
	document.getElementById('pRamSlider').min = 0
	document.getElementById('pRamInput').value = globalRam
	document.getElementById('pRamInput').min = 0
	document.getElementById('pJavaPathInput').value = globalJavaPath
	document.getElementById('editingProfileIndex').value = '-1'
	document.getElementById('profileModalTitle').textContent = 'Create Profile'
	document.getElementById('profileSettingsSection').classList.add('hidden')
	document.getElementById('profileSettingsArrow').classList.remove('rotate-180')
}

// Account handlers
window.switchAccountHandler = async (acc) => {
	setCurrentAuth(acc)
	await saveAllSettings()
	updateAccountUI()
	renderAccountList()
}

window.refreshAccountHandler = async (acc) => {
	showAlert(`Refreshing session for ${acc.name}...`, 'info')
	try {
		const result = await window.api.refreshMicrosoftToken(acc)
		if (result.success) {
			showAlert(`Session refreshed for ${acc.name}`, 'success')
			addAccountToState(result.auth)
			
			if (isCurrentAccount(acc)) {
				setCurrentAuth(result.auth)
				updateAccountUI()
			}
			
			await saveAllSettings()
			renderAccountList()
		} else {
			showAlert(`Failed to refresh: ${result.error}. Please remove and add account again.`, 'error')
		}
	} catch (e) {
		showAlert(`Error: ${e.message}`, 'error')
	}
}

window.removeAccountHandler = async (acc) => {
	showConfirm(`Are you sure you want to remove ${acc.name}?`, async () => {
		removeAccountFromState(acc)

		await saveAllSettings()
		renderAccountList()
		updateAccountUI()

		if (savedAccounts.length === 0) {
			const input = document.getElementById('offlineNameInput')
			if(input) {
				input.disabled = false
				input.readOnly = false
				input.value = ''
				input.focus()
				input.style.pointerEvents = 'auto'
			}
		}
	})
}

/*
	@returns {Promise<void>}
*/
async function handleSetOfflineAccount() {
	const nameInput = document.getElementById('offlineNameInput')
	const name = nameInput.value.trim()

	if (!name) {
		showConfirm("Please enter a username!", () => {
			nameInput.focus()
		})
		return
	}
	
	const generateUUID = () => {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0
			const v = c === 'x' ? r : (r & 0x3 | 0x8)
			return v.toString(16)
		})
	}
	
	const newAuth = {
		type: 'offline',
		name: name,
		uuid: generateUUID(),
		access_token: '',
		client_token: '',
		user_properties: '{}'
	}

	addAccountToState(newAuth)
	setCurrentAuth(newAuth)
	await saveAllSettings()
	
	updateAccountUI()
	renderAccountList()
	
	nameInput.value = ''
}

/*
	@returns {Promise<void>}
*/
async function performMicrosoftLogin() {
	const btn = document.getElementById('msLoginBtn')
	const originalText = btn.innerHTML
	btn.textContent = 'Please wait...'
	btn.disabled = true
	isMicrosoftLoginInProgress = true
	
	const res = await window.api.loginMicrosoft()
	
	isMicrosoftLoginInProgress = false
	
	if (res.success) {
		const newAuth = res.auth
		addAccountToState(newAuth)
		setCurrentAuth(newAuth)
		await saveAllSettings()
		
		updateAccountUI()
		renderAccountList()
		showAlert('Microsoft login successful!', 'success')
	} else if (res.error) {
		showAlert(`Login failed: ${res.error}`, 'error')
	}
	
	btn.innerHTML = originalText
	btn.disabled = false
}





// Settings handlers
async function handleSaveSettings() {
	const formData = getSettingsFormData()
	const gamePath = formData.gamePath
	const javaPath = formData.javaPath
	const ramMB = formData.ramMB
	const newHideLauncher = formData.hideLauncher
	const newExitAfterLaunch = formData.exitAfterLaunch
	
	const gamePathChanged = gamePath !== getCurrentSettings().gamePath
	
	const updatedSettings = getCurrentSettings()
	updatedSettings.gamePath = gamePath
	updatedSettings.javaPath = javaPath
	updatedSettings.ramMB = ramMB
	updatedSettings.hideLauncher = newHideLauncher
	updatedSettings.exitAfterLaunch = newExitAfterLaunch
	
	setCurrentSettings(updatedSettings)
	setHideLauncher(newHideLauncher)
	setExitAfterLaunch(newExitAfterLaunch)
	
	if (gamePathChanged) {
		const settingsToSave = {
			gamePath: updatedSettings.gamePath,
			javaPath: updatedSettings.javaPath,
			ramMB: updatedSettings.ramMB,
			hideLauncher: updatedSettings.hideLauncher,
			exitAfterLaunch: updatedSettings.exitAfterLaunch,
			auth: updatedSettings.auth,
			accounts: updatedSettings.accounts
		}
		await window.api.saveSettings(settingsToSave)
	} else {
		updatedSettings.profiles = profiles
		await window.api.saveSettings(updatedSettings)
	}
	
	closeSettings()
	await loadSettings()
}


/*
	@returns {Promise<void>}
*/
async function saveAllSettings() {
	const settings = {
		gamePath: getCurrentSettings().gamePath,
		javaPath: getCurrentSettings().javaPath,
		ramMB: getCurrentSettings().ramMB || 4096,
		hideLauncher: getCurrentSettings().hideLauncher,
		exitAfterLaunch: getCurrentSettings().exitAfterLaunch,
		profiles: profiles,
		auth: getCurrentAuth(),
		accounts: savedAccounts
	}
	await window.api.saveSettings(settings)
}

/*
	@returns {void}
*/
function setupIpcListeners() {
	window.api.onLog((data) => {
		logger.info(`[IPC] Received log: ${JSON.stringify(data)}`)
		
		const instanceId = data.instanceId
		const msg = data.message
		
		if (!instances[instanceId]) {
			logger.info(`[IPC] Instance not found: ${instanceId}, Available: ${JSON.stringify(Object.keys(instances))}`)
			return
		}
		
		const container = instances[instanceId].logContainer
		const line = document.createElement('div')
		line.className = 'select-text'
		line.textContent = msg
		container.appendChild(line)
		container.scrollTop = container.scrollHeight
		
		if (msg.includes('Game closed')) {
			instances[instanceId].button.classList.add('opacity-50')
			instances[instanceId].button.title = `${instances[instanceId].profileName} (Closed)`
		}
	})
	
	window.api.onTokenRefreshed((auth) => {
		logger.info(`[TOKEN] Refreshed token for: ${auth.name}`)
		setCurrentAuth(auth)
		
		const accounts = savedAccounts
		const accIndex = accounts.findIndex(a => a.name === auth.name && a.type === 'ms')
		if (accIndex !== -1) {
			accounts[accIndex] = auth
			setSavedAccounts(accounts)
		}
		
		updateAccountUI()
		renderAccountList()
	})
}

async function loadSettings() {
	logger.info(`[FRONTEND] Calling getSettings...`)
	const settings = await window.api.getSettings()
	logger.info(`[FRONTEND] Received settings:`)
	logger.info(`[FRONTEND] - gamePath: ${settings.gamePath}`)
	logger.info(`[FRONTEND] - profiles count: ${settings.profiles?.length || 0}`)
	logger.info(`[FRONTEND] - profiles: ${JSON.stringify(settings.profiles)}`)
	
	setCurrentSettings(settings)
	setProfiles(settings.profiles || [])
	logger.info(`[FRONTEND] Set profiles: ${profiles.length}`)
	
	setSavedAccounts(settings.accounts || [])
	setCurrentAuth(settings.auth || null)
	setHideLauncher(settings.hideLauncher || false)
	setExitAfterLaunch(settings.exitAfterLaunch || false)
	
	if (getCurrentAuth()) {
		addAccountToState(getCurrentAuth())
	}

	updateAccountUI()

	if (profiles.length > 0) {
		selectProfile(0)
	}
	renderProfileList()
}

/*
	@returns {Promise<void>}
*/
async function loadVersions() {
	logger.info(`[FRONTEND] Calling getVersions...`)
	
	let result
	if (!navigator.onLine) {
		logger.info(`[FRONTEND] Offline detected, fetching installed versions only...`)
		result = await window.api.getInstalledVersions()
	} else {
		result = await window.api.getVersions()
		if (!result.success && result.error && result.error.includes('Failed to fetch')) {
			logger.info(`[FRONTEND] Fetch failed, falling back to installed versions...`)
			result = await window.api.getInstalledVersions()
		}
	}

	if (!result.success) {
		showAlert(`Failed to fetch versions: ${result.error}`, 'error')
		versions = []
	} else {
		versions = result.versions || []
	}
	logger.info(`[FRONTEND] Received versions: ${versions.length}`)
	
	const select = document.getElementById('pVersion')
	select.innerHTML = ''
	
	if (versions.length === 0) {
		const opt = document.createElement('option')
		opt.value = ''
		opt.textContent = navigator.onLine ? 'Failed to load versions' : 'No installed versions found'
		opt.disabled = true
		select.appendChild(opt)
		return
	}
	
	const showSnapshots = document.getElementById('showSnapshots').checked
	const showHistorical = document.getElementById('showHistorical').checked

	const filtered = versions.filter(v => {
		if (v.id === 'latest-release' || v.id === 'latest-snapshot') return false
		if (v.type === 'release') return true
		if (v.type === 'custom') return true
		
		if (showSnapshots && v.type === 'snapshot') return true
		if (showHistorical && (v.type === 'old_beta' || v.type === 'old_alpha')) return true
		return false
	})
	
	filtered.forEach(v => {
		const opt = document.createElement('option')
		opt.value = v.id
		opt.textContent = v.id
		select.appendChild(opt)
	})
}

/*
	@param {string} instanceId
	@param {string} profileName
	@returns {void}
*/
function createConsoleInstance(instanceId, profileName) {
	const consoleButtonsContainer = document.getElementById('consoleButtons')
	const logsArea = document.getElementById('logsArea')
	
	if (Object.keys(instances).length === 0) {
		document.getElementById('consoleTab').classList.remove('hidden')
		switchTab('console')
	}
	
	const btn = document.createElement('button')
	btn.className = 'group flex-shrink-0 min-w-32 max-w-48 pl-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-left transition-colors border border-neutral-700 flex items-center justify-between'

	btn.innerHTML = `
		<div class="flex flex-col overflow-hidden">
			<span class="font-bold text-md text-gray-100 truncate">${profileName}</span>
			<span class="text-xs text-neutral-900 font-mono mt-0.5">
				ID: <span class="select-text text-neutral-300 hover:text-white cursor-text" onclick="event.stopPropagation()">${instanceId}</span>
			</span>
		</div>
	`
	btn.title = `${profileName} (${instanceId})`
	btn.onclick = () => switchToInstance(instanceId)
	
	const logContainer = document.createElement('div')
	logContainer.className = 'hidden absolute inset-0 bg-black rounded p-4 font-mono text-xs text-green-400 overflow-y-auto'
	logContainer.dataset.instanceId = instanceId
	
	const closeBtn = document.createElement('span')
	closeBtn.className = 'text-neutral-500 hover:text-red-400 text-xl font-bold px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity'
	closeBtn.innerHTML = '×'
	closeBtn.onclick = (e) => {
		e.stopPropagation()
		removeConsoleInstance(instanceId)
	}
	btn.appendChild(closeBtn)
	
	consoleButtonsContainer.appendChild(btn)
	logsArea.appendChild(logContainer)
	
	instances[instanceId] = {
		button: btn,
		logContainer: logContainer,
		profileName: profileName
	}
	
	logger.info(`[INSTANCE] Created instance: ${instanceId}, Total instances: ${Object.keys(instances).length}`)
	
	switchToInstance(instanceId)
}

/*
	@param {string} instanceId
	@returns {void}
*/
function switchToInstance(instanceId) {
	if (!instances[instanceId]) return
	
	activeInstanceId = instanceId
	
	// update button states
	Object.entries(instances).forEach(([id, inst]) => {
		if (id === instanceId) {
			inst.button.classList.add('bg-green-600', 'border-green-500')
			inst.button.classList.remove('bg-neutral-800', 'hover:bg-neutral-700', 'border-neutral-700')
			
			const idVal = inst.button.querySelector('.select-text')
			if(idVal) idVal.classList.add('text-white')
			
			inst.logContainer.classList.remove('hidden')
		} else {
			inst.button.classList.remove('bg-green-600', 'border-green-500')
			inst.button.classList.add('bg-neutral-800', 'hover:bg-neutral-700', 'border-neutral-700')
			
			const idVal = inst.button.querySelector('.select-text')
			if(idVal) idVal.classList.remove('text-white')

			inst.logContainer.classList.add('hidden')
		}
	})
}

/*
	@param {string} instanceId
	@returns {void}
*/
function removeConsoleInstance(instanceId) {
	if (!instances[instanceId]) return
	
	instances[instanceId].button.remove()
	instances[instanceId].logContainer.remove()
	delete instances[instanceId]
	
	if (Object.keys(instances).length === 0) {
		document.getElementById('consoleTab').classList.add('hidden')
		switchTab('preview')
		activeInstanceId = null
		return
	}
	
	if (activeInstanceId === instanceId) {
		const remainingIds = Object.keys(instances)
		if (remainingIds.length > 0) {
			switchToInstance(remainingIds[0])
		} else {
			activeInstanceId = null
		}
	}
}

/*
	@returns {Promise<void>}
*/
async function launchGame() {
	if (selectedProfileIndex === -1) return

	if (!getCurrentAuth()) {
		showConfirm("Please select or add an account first!", () => {
			document.getElementById('accountSection').click()
		})
		return
	}

	const p = profiles[selectedProfileIndex]
	
	const diskCheck = await window.api.checkDiskSpace()
	if (diskCheck.success && !diskCheck.hasSpace) {
		showAlert(`Insufficient disk space: ${diskCheck.availableGB}GB available, ${diskCheck.requiredGB}GB required`, 'error')
		return
	}
	
	const instanceId = Date.now().toString()
	
	createConsoleInstance(instanceId, p.name)
	
	document.getElementById('statusMessage').textContent = `Launching ${p.name}...`
	
	const finalAuth = getMCLCAuth()
	if (!finalAuth) {
		showAlert('Invalid account configuration', 'error')
		removeConsoleInstance(instanceId)
		document.getElementById('statusMessage').textContent = 'Ready to launch'
		return
	}

	const options = {
		instanceId: instanceId,
		profileName: p.name,
		auth: finalAuth,
		version: p.version,
		gamePath: getCurrentSettings().gamePath,
		javaPath: getCurrentSettings().javaPath,
		profileSettings: p.settings || null
	}

	const result = await window.api.launch(options)
	
	if (!result.success) {
		showAlert(`Launch failed: ${result.error}`, 'error')
		removeConsoleInstance(instanceId)
		document.getElementById('statusMessage').textContent = 'Ready to launch'
		return
	}
	
	document.getElementById('statusMessage').textContent = 'Ready to launch'
}
