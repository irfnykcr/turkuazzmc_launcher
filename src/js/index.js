

import { profiles, selectedProfileIndex, setProfiles, renderProfileList, selectProfile, showCreateProfile,
		addProfile, deleteProfile } from './profiles.js'

import { currentAuth, savedAccounts, setSavedAccounts, setCurrentAuth, getCurrentAuth, getMCLCAuth, updateAccountUI,
		renderAccountList, addAccountToState, removeAccountFromState } from './accounts.js'

import { currentSettings, ramAllocation, setCurrentSettings, setRamAllocation, getRamAllocation,
		getCurrentSettings, showSettings, closeSettings, browseGamePath, getSettingsFormData,
		setHideLauncher, setExitAfterLaunch } from './settings.js'

let versions = []
let instances = {}
let activeInstanceId = null
let isMicrosoftLoginInProgress = false

document.addEventListener('DOMContentLoaded', async () => {
	console.log('[FRONTEND] DOMContentLoaded')
	setupEventListeners()

	console.log('[FRONTEND] Loading settings...')
	await loadSettings()
	console.log('[FRONTEND] Settings loaded, profiles:', profiles.length)
	
	console.log('[FRONTEND] Loading versions...')
	await loadVersions()
	console.log('[FRONTEND] Versions loaded:', versions.length)
	
	setupIpcListeners()
	console.log('[FRONTEND] Initialization complete')
})

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
	document.getElementById('ramSlider').addEventListener('input', (e) => {
		document.getElementById('ramInput').value = e.target.value
	})
	document.getElementById('ramInput').addEventListener('input', (e) => {
		let val = parseInt(e.target.value) || 512
		val = Math.max(512, Math.min(16384, val))
		document.getElementById('ramSlider').value = val
		e.target.value = val
	})

	document.getElementById('hideLauncherCheckbox').addEventListener('change', (e) => {
		const exitCheckbox = document.getElementById('exitAfterLaunchCheckbox')
		exitCheckbox.disabled = !e.target.checked
		if (!e.target.checked) {
			exitCheckbox.checked = false
		}
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
	const container = document.getElementById('toastContainer')
	const toast = document.createElement('div')
	toast.className = 'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transform transition-all duration-300 opacity-0 translate-x-full'
	
	if (type === 'error') {
		toast.className += ' bg-red-900 border-red-700 text-red-100'
	} else if (type === 'success') {
		toast.className += ' bg-green-900 border-green-700 text-green-100'
	} else {
		toast.className += ' bg-neutral-800 border-neutral-600 text-neutral-100'
	}
	
	toast.innerHTML = `
		<span class="flex-1 text-sm">${msg}</span>
		<button class="text-current hover:opacity-70 text-xl font-bold leading-none">&times;</button>
	`
	
	container.appendChild(toast)
	
	const closeBtn = toast.querySelector('button')
	const removeToast = () => {
		toast.classList.add('opacity-0', 'translate-x-full')
		setTimeout(() => toast.remove(), 300)
	}
	
	closeBtn.onclick = removeToast
	
	setTimeout(() => {
		toast.classList.remove('opacity-0', 'translate-x-full')
	}, 10)
	
	setTimeout(removeToast, 5000)
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
	
	const newProfile = { name, version }
	addProfile(newProfile)
	
	await saveAllSettings()
	document.getElementById('profileModal').classList.add('hidden')
}

// Account handlers
window.switchAccountHandler = async (acc) => {
	setCurrentAuth(acc)
	await saveAllSettings()
	updateAccountUI()
	renderAccountList()
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
	const newRamAllocation = formData.ramAllocation
	const newHideLauncher = formData.hideLauncher
	const newExitAfterLaunch = formData.exitAfterLaunch
	
	const gamePathChanged = gamePath !== getCurrentSettings().gamePath
	
	const updatedSettings = getCurrentSettings()
	updatedSettings.gamePath = gamePath
	updatedSettings.javaPath = javaPath
	updatedSettings.ramAllocation = newRamAllocation
	updatedSettings.hideLauncher = newHideLauncher
	updatedSettings.exitAfterLaunch = newExitAfterLaunch
	
	setCurrentSettings(updatedSettings)
	setRamAllocation(newRamAllocation)
	setHideLauncher(newHideLauncher)
	setExitAfterLaunch(newExitAfterLaunch)
	
	if (gamePathChanged) {
		const settingsToSave = {
			gamePath: updatedSettings.gamePath,
			javaPath: updatedSettings.javaPath,
			ramAllocation: updatedSettings.ramAllocation,
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
	const settings = await window.api.getSettings()
	settings.profiles = profiles
	settings.auth = getCurrentAuth()
	settings.accounts = savedAccounts
	await window.api.saveSettings(settings)
}

/*
	@returns {void}
*/
function setupIpcListeners() {
	window.api.onLog((data) => {
		console.log('[IPC] Received log:', data)
		
		const instanceId = data.instanceId
		const msg = data.message
		
		if (!instances[instanceId]) {
			console.warn('[IPC] Instance not found:', instanceId, 'Available:', Object.keys(instances))
			return
		}
		
		const container = instances[instanceId].logContainer
		const line = document.createElement('div')
		line.textContent = msg
		container.appendChild(line)
		container.scrollTop = container.scrollHeight
		
		if (msg.includes('Game closed')) {
			instances[instanceId].button.classList.add('opacity-50')
			instances[instanceId].button.title = `${instances[instanceId].profileName} (Closed)`
		}
	})
	
	window.api.onTokenRefreshed((auth) => {
		console.log('[TOKEN] Refreshed token for:', auth.name)
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
	console.log('[FRONTEND] Calling getSettings...')
	const settings = await window.api.getSettings()
	console.log('[FRONTEND] Received settings:', settings)
	setCurrentSettings(settings)
	setProfiles((settings.profiles || []).filter(p => !['latest-release', 'latest-snapshot'].includes(p.version)))
	console.log('[FRONTEND] Filtered profiles:', profiles)
	
	setSavedAccounts(settings.accounts || [])
	setCurrentAuth(settings.auth || null)
	setRamAllocation(settings.ramAllocation || 2048)
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
	console.log('[FRONTEND] Calling getVersions...')
	const result = await window.api.getVersions()
	if (!result.success) {
		showAlert(`Failed to fetch versions: ${result.error}`, 'error')
		versions = []
	} else {
		versions = result.versions || []
	}
	console.log('[FRONTEND] Received versions:', versions.length)
	
	const select = document.getElementById('pVersion')
	select.innerHTML = ''
	
	if (versions.length === 0) {
		const opt = document.createElement('option')
		opt.value = ''
		opt.textContent = 'Failed to load versions'
		opt.disabled = true
		select.appendChild(opt)
		return
	}
	
	const showSnapshots = document.getElementById('showSnapshots').checked
	const showHistorical = document.getElementById('showHistorical').checked

	const filtered = versions.filter(v => {
		if (v.id === 'latest-release' || v.id === 'latest-snapshot') return false
		if (v.type === 'release') return true
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
	
	console.log('[INSTANCE] Created instance:', instanceId, 'Total instances:', Object.keys(instances).length)
	
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
	
	// switch to another instance if this was active
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
		ram: `${getRamAllocation()}M`,
		gamePath: getCurrentSettings().gamePath,
		javaPath: getCurrentSettings().javaPath
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
