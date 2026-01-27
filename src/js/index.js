

import { profiles, selectedProfileIndex, setProfiles, renderProfileList, selectProfile, showCreateProfile,
		addProfile, deleteProfile } from './profiles.js'

import { currentAuth, savedAccounts, setSavedAccounts, setCurrentAuth, getCurrentAuth, updateAccountUI,
		renderAccountList, addAccountToState, removeAccountFromState } from './accounts.js'

import { currentSettings, ramAllocation, setCurrentSettings, setRamAllocation, getRamAllocation,
		getCurrentSettings, showSettings, closeSettings, browseGamePath, getSettingsFormData,
		setHideLauncher, setExitAfterLaunch } from './settings.js'

let versions = []
let instances = {}
let activeInstanceId = null

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
		accModal.classList.add('hidden')
	}

	document.getElementById('closeAccountModalBtn').addEventListener('click', closeModal)
	accOverlay.addEventListener('click', closeModal)
	
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
}

let confirmCallback = null
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

function showConfirm(msg, callback) {
	document.getElementById('confirmMessage').textContent = msg
	confirmCallback = callback
	document.getElementById('confirmModal').classList.remove('hidden')
}





// Profile handlers
window.removeProfileHandler = async (index) => {
	const p = profiles[index]
	showConfirm(`Are you sure you want to delete profile "${p.name}"?`, async () => {
		deleteProfile(index)
		await saveAllSettings()
	})
}

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

async function handleSetOfflineAccount() {
	const nameInput = document.getElementById('offlineNameInput')
	const name = nameInput.value.trim()

	if (!name) {
		showConfirm("Please enter a username!", () => {
			nameInput.focus()
		})
		return
	}
	
	const newAuth = {
		type: 'offline',
		name: name,
		uuid: '00000000-0000-0000-0000-000000000000',
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

async function performMicrosoftLogin() {
	const btn = document.getElementById('msLoginBtn')
	const originalText = btn.innerHTML
	btn.textContent = 'Please wait...'
	btn.disabled = true
	
	const res = await window.api.loginMicrosoft()
	
	if (res.success) {
		const newAuth = {
			type: 'ms',
			...res.account
		}
		addAccountToState(newAuth)
		setCurrentAuth(newAuth)
		await saveAllSettings()
		
		updateAccountUI()
		renderAccountList()
	} else {
		showConfirm(`Login failed: ${res.error}`, () => {})
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



async function saveAllSettings() {
	const settings = await window.api.getSettings()
	settings.profiles = profiles
	settings.auth = getCurrentAuth()
	settings.accounts = savedAccounts
	await window.api.saveSettings(settings)
}

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

async function loadVersions() {
	console.log('[FRONTEND] Calling getVersions...')
	versions = await window.api.getVersions()
	console.log('[FRONTEND] Received versions:', versions ? versions.length : 0)
	const select = document.getElementById('pVersion')
	select.innerHTML = ''
	
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

async function launchGame() {
	if (selectedProfileIndex === -1) return

	if (!getCurrentAuth()) {
		showConfirm("Please select or add an account first!", () => {
			document.getElementById('accountSection').click()
		})
		return
	}

	const p = profiles[selectedProfileIndex]
	const instanceId = Date.now().toString()
	
	createConsoleInstance(instanceId, p.name)
	
	document.getElementById('statusMessage').textContent = `Launching ${p.name}...`
	
	let finalAuth = { ...getCurrentAuth() }
	if (finalAuth.type === 'offline') {
		finalAuth = {
			access_token: "",
			client_token: "",
			uuid: "00000000-0000-0000-0000-000000000000",
			name: finalAuth.name,
			user_properties: {}
		}
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

	await window.api.launch(options)
	document.getElementById('statusMessage').textContent = 'Ready to launch'
}
