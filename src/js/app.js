

let profiles = []
let savedAccounts = [] // { type, name, uuid, ... }
let selectedProfileIndex = -1
let versions = []
let isLaunching = false
let currentAuth = null
let currentSettings = {}
let ramAllocation = 2

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
    document.getElementById('profileForm').addEventListener('submit', saveProfile)
    
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
    document.getElementById('setOfflineBtn').addEventListener('click', setOfflineAccount)
    
    document.getElementById('launchBtn').addEventListener('click', launchGame)
    
    document.getElementById('showSnapshots').addEventListener('change', loadVersions)
    document.getElementById('showHistorical').addEventListener('change', loadVersions)

    document.getElementById('settingsBtn').addEventListener('click', showSettings)
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings)
    document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettings)
    document.getElementById('settingsModalOverlay').addEventListener('click', closeSettings)
    document.getElementById('settingsForm').addEventListener('submit', saveSettings)
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
    currentSettings = settings
    profiles = (settings.profiles || []).filter(p => !['latest-release', 'latest-snapshot'].includes(p.version))
    console.log('[FRONTEND] Filtered profiles:', profiles)
    
    savedAccounts = settings.accounts || []
    currentAuth = settings.auth || null
    ramAllocation = settings.ramAllocation || 2048
    
    if (currentAuth) {
        addAccountToState(currentAuth)
    }

    updateAccountUI()

    if (profiles.length > 0) {
        selectProfile(0)
    }
    renderProfileList()
}

function showSettings() {
    document.getElementById('gamePathInput').value = currentSettings.gamePath || ''
    document.getElementById('javaPathInput').value = currentSettings.javaPath || 'java'
    document.getElementById('ramSlider').value = ramAllocation
    document.getElementById('ramInput').value = ramAllocation
    document.getElementById('settingsModal').classList.remove('hidden')
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden')
}

async function browseGamePath() {
    const folder = await window.api.selectFolder()
    if (folder) {
        document.getElementById('gamePathInput').value = folder
    }
}

async function saveSettings(e) {
    e.preventDefault()
    
    const gamePath = document.getElementById('gamePathInput').value
    const javaPath = document.getElementById('javaPathInput').value
    ramAllocation = parseInt(document.getElementById('ramInput').value)
    
    const gamePathChanged = gamePath !== currentSettings.gamePath
    
    currentSettings.gamePath = gamePath
    currentSettings.javaPath = javaPath
    currentSettings.ramAllocation = ramAllocation
    
    if (gamePathChanged) {
        const settingsToSave = {
            gamePath: currentSettings.gamePath,
            javaPath: currentSettings.javaPath,
            ramAllocation: currentSettings.ramAllocation,
            auth: currentSettings.auth,
            accounts: currentSettings.accounts
        }
        await window.api.saveSettings(settingsToSave)
    } else {
        currentSettings.profiles = profiles
        await window.api.saveSettings(currentSettings)
    }
    
    closeSettings()
    
    await loadSettings()
}

function updateAccountUI() {
    if(!currentAuth) {
        document.getElementById('accountName').textContent = "No Account"
        document.getElementById('accountType').textContent = "Select Account"
        document.getElementById('accountType').className = "text-[10px] uppercase font-bold text-red-500"
        document.getElementById('accountAvatar').src = "https://mc-heads.net/avatar/MHF_Steve"
        document.getElementById('accountAvatar').className = "w-8 h-8 rounded border-2 border-red-500 bg-gray-600"
        return
    }

    document.getElementById('accountName').textContent = currentAuth.name
    
    const isOnline = currentAuth.type === 'ms'
    const typeLabel = isOnline ? 'Online Account' : 'Offline Account'
    const typeColor = isOnline ? 'text-green-500' : 'text-gray-500'
    const avatarBorder = isOnline ? 'border-green-500' : 'border-gray-500'
    
    const typeEl = document.getElementById('accountType')
    typeEl.textContent = typeLabel
    typeEl.className = `text-[10px] uppercase font-bold ${typeColor} flex items-center gap-1`
    
    typeEl.innerHTML = `<span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'} inline-block"></span> ${typeLabel}`

    const avatarUrl = `https://mc-heads.net/avatar/${currentAuth.name}`
    const avatar = document.getElementById('accountAvatar')
    avatar.src = avatarUrl
    avatar.className = `w-8 h-8 rounded border-2 ${avatarBorder}`
}

function renderAccountList() {
    const container = document.getElementById('savedAccountsList')
    container.innerHTML = ''

    if (savedAccounts.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10 italic">No saved accounts</div>`
        return
    }

    const onlineAccs = savedAccounts.filter(a => a.type === 'ms')
    const offlineAccs = savedAccounts.filter(a => a.type === 'offline')

    const createGroup = (title, list) => {
        if(list.length === 0) return
        
        const groupTitle = document.createElement('div')
        groupTitle.className = "text-xs font-bold text-gray-400 mt-4 mb-2 uppercase px-2"
        groupTitle.textContent = title
        container.appendChild(groupTitle)

        list.forEach((acc) => {
            const el = document.createElement('div')
            const isActive = isCurrentAccount(acc)
            const activeClass = isActive ? 'bg-gray-700 border-green-500' : 'bg-gray-800 hover:bg-gray-750 border-transparent'
            
            el.className = `flex items-center justify-between p-3 rounded border-l-4 mb-2 cursor-pointer transition ${activeClass}`
            el.onclick = () => switchAccount(acc)

            const avatarUrl = `https://mc-heads.net/avatar/${acc.name}`
            
            el.innerHTML = `
                <div class="flex items-center gap-3">
                    <img src="${avatarUrl}" class="w-8 h-8 rounded bg-gray-600">
                    <div class="flex flex-col">
                        <span class="font-bold text-white text-sm leading-tight">${acc.name}</span>
                        <span class="text-[10px] text-gray-400 leading-tight">${acc.type === 'ms' ? 'Microsoft' : 'Offline'}</span>
                    </div>
                </div>
                <button class="text-gray-500 hover:text-red-500 p-2 del-btn transition" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            `
            
            el.querySelector('.del-btn').onclick = (e) => {
                e.stopPropagation()
                removeAccount(acc)
            }

            container.appendChild(el)
        })
    }

    createGroup('Microsoft Accounts', onlineAccs)
    createGroup('Offline Accounts', offlineAccs)
}

function isCurrentAccount(acc) {
    if (acc.type !== currentAuth.type) return false
    if (acc.type === 'ms') return acc.uuid === currentAuth.uuid
    if (acc.type === 'offline') return acc.name === currentAuth.name
    return false
}

async function switchAccount(acc) {
    currentAuth = acc
    await saveAllSettings()
    updateAccountUI()
    renderAccountList()
}

async function removeAccount(acc) {
    showConfirm(`Are you sure you want to remove ${acc.name}?`, async () => {
        if(acc.type === 'ms') {
            savedAccounts = savedAccounts.filter(a => !(a.type === 'ms' && a.uuid === acc.uuid))
        } else {
            savedAccounts = savedAccounts.filter(a => !(a.type === 'offline' && a.name === acc.name))
        }

        if(isCurrentAccount(acc)) {
            if(savedAccounts.length > 0) {
                currentAuth = savedAccounts[0]
            } else {
                currentAuth = null
            }
        }

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

function addAccountToState(acc) {
    if(acc.type === 'ms') {
        const idx = savedAccounts.findIndex(a => a.type === 'ms' && a.uuid === acc.uuid)
        if(idx !== -1) {
            savedAccounts[idx] = acc
        } else {
            savedAccounts.push(acc)
        }
    } else {
        const idx = savedAccounts.findIndex(a => a.type === 'offline' && a.name === acc.name)
        if(idx !== -1) {
            savedAccounts[idx] = acc
        } else {
            savedAccounts.push(acc)
        }
    }
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

function renderProfileList() {
    const list = document.getElementById('profileList')
    list.innerHTML = ''
    
    profiles.forEach((p, idx) => {
        const div = document.createElement('div')
        const isSelected = selectedProfileIndex === idx
        div.className = `p-3 rounded cursor-pointer transition relative group ${isSelected ? 'bg-gray-700 border-l-4 border-green-500' : 'bg-gray-800 hover:bg-gray-700'}`
        
        div.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex-1" data-profile-idx="${idx}">
                    <div class="font-bold">${p.name}</div>
                    <div class="text-xs text-gray-500">${p.version}</div>
                </div>
                <button class="delete-profile-btn opacity-0 group-hover:opacity-100 transition text-gray-500 hover:text-red-500 p-1" data-profile-idx="${idx}" title="Delete Profile">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `
        
        div.querySelector('[data-profile-idx]').onclick = () => selectProfile(idx)
        div.querySelector('.delete-profile-btn').onclick = (e) => {
            e.stopPropagation()
            removeProfile(idx)
        }
        
        list.appendChild(div)
    })
}

function selectProfile(index) {
    selectedProfileIndex = index
    const p = profiles[index]
    document.getElementById('currentProfileName').textContent = p.name
    document.getElementById('currentProfileVersion').textContent = `Version: ${p.version}`
    document.getElementById('currentProfileMode').textContent = `Ready`
    renderProfileList()
}

async function removeProfile(index) {
    const p = profiles[index]
    showConfirm(`Are you sure you want to delete profile "${p.name}"?`, async () => {
        profiles.splice(index, 1)
        
        if (selectedProfileIndex === index) {
            selectedProfileIndex = profiles.length > 0 ? 0 : -1
        } else if (selectedProfileIndex > index) {
            selectedProfileIndex--
        }
        
        await saveAllSettings()
        renderProfileList()
        
        if (profiles.length > 0 && selectedProfileIndex !== -1) {
            selectProfile(selectedProfileIndex)
        } else {
            document.getElementById('currentProfileName').textContent = 'No Profile Selected'
            document.getElementById('currentProfileVersion').textContent = 'Version: -'
            document.getElementById('currentProfileMode').textContent = 'Mode: -'
        }
    })
}

function showCreateProfile() {
    document.getElementById('profileModal').classList.remove('hidden')
    document.getElementById('pName').value = `My Profile ${profiles.length + 1}`
}

async function saveProfile(e) {
    e.preventDefault()
    const name = document.getElementById('pName').value
    const version = document.getElementById('pVersion').value
    
    const newProfile = { name, version }
    profiles.push(newProfile)
    
    await saveAllSettings()

    renderProfileList()
    selectProfile(profiles.length - 1)
    document.getElementById('profileModal').classList.add('hidden')
}

async function saveAllSettings() {
    const settings = await window.api.getSettings()
    settings.profiles = profiles
    settings.auth = currentAuth
    settings.accounts = savedAccounts
    await window.api.saveSettings(settings)
}


async function setOfflineAccount() {
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
    currentAuth = newAuth
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
        currentAuth = newAuth
        await saveAllSettings()
        
        updateAccountUI()
        renderAccountList()
    } else {
        showConfirm(`Login failed: ${res.error}`, () => {})
    }
    
    btn.innerHTML = originalText
    btn.disabled = false
}

async function launchGame() {
    if (selectedProfileIndex === -1) return
    if (isLaunching) return

    if (!currentAuth) {
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
    
    let finalAuth = { ...currentAuth }
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
        ram: `${ramAllocation}M`,
        gamePath: currentSettings.gamePath,
        javaPath: currentSettings.javaPath
    }

    await window.api.launch(options)
    isLaunching = false 
    document.getElementById('launchBtn').disabled = false
}
