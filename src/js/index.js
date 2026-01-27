

import { profiles, selectedProfileIndex, setProfiles, renderProfileList, selectProfile, showCreateProfile, addProfile, deleteProfile } from './profiles.js'
import { savedAccounts, currentAuth, setSavedAccounts, setCurrentAuth, getCurrentAuth, updateAccountUI, renderAccountList, addAccountToState, removeAccountFromState } from './accounts.js'
import { currentSettings, ramAllocation, setCurrentSettings, setRamAllocation, getRamAllocation, getCurrentSettings, showSettings, closeSettings, browseGamePath, getSettingsFormData } from './settings.js'

let versions = []
let isLaunching = false

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
    document.getElementById('settingsForm').addEventListener('submit', handleSaveSettings)
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
async function handleSaveSettings(e) {
    e.preventDefault()
    
    const formData = getSettingsFormData()
    const gamePath = formData.gamePath
    const javaPath = formData.javaPath
    const newRamAllocation = formData.ramAllocation
    
    const gamePathChanged = gamePath !== getCurrentSettings().gamePath
    
    const updatedSettings = getCurrentSettings()
    updatedSettings.gamePath = gamePath
    updatedSettings.javaPath = javaPath
    updatedSettings.ramAllocation = newRamAllocation
    
    setCurrentSettings(updatedSettings)
    setRamAllocation(newRamAllocation)
    
    if (gamePathChanged) {
        const settingsToSave = {
            gamePath: updatedSettings.gamePath,
            javaPath: updatedSettings.javaPath,
            ramAllocation: updatedSettings.ramAllocation,
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

// Save all settings helper
async function saveAllSettings() {
    const settings = await window.api.getSettings()
    settings.profiles = profiles
    settings.auth = getCurrentAuth()
    settings.accounts = savedAccounts
    await window.api.saveSettings(settings)
}

function setupIpcListeners() {
    window.api.onLog((msg) => {
        const c = document.getElementById('logsContainer')
        c.classList.remove('hidden')
        const search = '[DATA]'
        if(msg.startsWith(search)) {
            msg = msg.substring(search.length)
        }
        const line = document.createElement('div')
        line.textContent = msg
        c.appendChild(line)
        c.scrollTop = c.scrollHeight
        
        if (msg.includes('Game closed')) {
            document.getElementById('statusMessage').textContent = 'Game closed'
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

async function launchGame() {
    if (selectedProfileIndex === -1) return
    if (isLaunching) return

    if (!getCurrentAuth()) {
        showConfirm("Please select or add an account first!", () => {
            document.getElementById('accountSection').click()
        })
        return
    }

    const p = profiles[selectedProfileIndex]
    
    isLaunching = true
    document.getElementById('launchBtn').disabled = true
    document.getElementById('statusMessage').textContent = "Launching..."
    document.getElementById('logsContainer').innerHTML = ''
    document.getElementById('logsContainer').classList.add('hidden')
    
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
        auth: finalAuth,
        version: p.version,
        ram: `${getRamAllocation()}M`,
        gamePath: getCurrentSettings().gamePath,
        javaPath: getCurrentSettings().javaPath
    }

    await window.api.launch(options)
    isLaunching = false 
    document.getElementById('launchBtn').disabled = false
}
