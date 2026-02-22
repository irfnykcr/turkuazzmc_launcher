import { getCurrentSettings } from './settings.js'

export let profiles = []
export let selectedProfileIndex = -1

/*
	@param {Array} newProfiles
	@returns {void}
*/
export function setProfiles(newProfiles) {
	profiles = newProfiles
}

/*
	@returns {void}
*/
export function renderProfileList() {
	const list = document.getElementById('profileList')
	list.innerHTML = ''
	
	profiles.forEach((p, idx) => {
		const div = document.createElement('div')
		const isSelected = selectedProfileIndex === idx
		div.className = `p-3 rounded cursor-pointer transition relative group ${isSelected ? 'bg-neutral-700 border-l-4 border-green-500' : 'bg-neutral-900 hover:bg-neutral-700'}`
		
		div.innerHTML = `
			<div class="flex items-center justify-between">
				<div class="flex-1" data-profile-idx="${idx}">
					<div class="font-bold">${p.name}</div>
					<div class="text-xs text-neutral-500">${p.version}</div>
				</div>
				<button class="delete-profile-btn opacity-0 group-hover:opacity-100 transition text-neutral-500 hover:text-red-500 p-1" data-profile-idx="${idx}" title="Delete Profile">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
				</button>
			</div>
		`
		
		div.querySelector('[data-profile-idx]').onclick = () => selectProfile(idx)
		div.querySelector('.delete-profile-btn').onclick = (e) => {
			e.stopPropagation()
			window.removeProfileHandler(idx)
		}
		
		list.appendChild(div)
	})
}

/*
	@param {number} index
	@returns {void}
*/
export function selectProfile(index) {
	selectedProfileIndex = index
	const p = profiles[index]
	document.getElementById('currentProfileName').textContent = p.name
	document.getElementById('currentProfileVersion').textContent = `Version: ${p.version}`
	document.getElementById('currentProfileMode').textContent = `Ready`
	renderProfileList()
	updatePreview()
}

/*
	@returns {void}
*/
export function showCreateProfile() {
	const globalRam = getCurrentSettings().ramMB || 4096
	document.getElementById('pRamSlider').min = 0
	document.getElementById('pRamSlider').value = globalRam
	document.getElementById('pRamInput').min = 0
	document.getElementById('pRamInput').value = globalRam
	document.getElementById('pRamHelp').textContent = `Starts from global setting (${globalRam} MB), adjust as needed`
	document.getElementById('pJavaVersion').value = '17'
	document.getElementById('profileSettingsSection').classList.remove('hidden')
	document.getElementById('profileSettingsArrow').classList.add('rotate-180')
	document.getElementById('profileModal').classList.remove('hidden')
	document.getElementById('pName').value = `My Profile ${profiles.length + 1}`
}

/*
	@returns {void}
*/
export function closeCreateProfile() {
	document.getElementById('profileModal').classList.add('hidden')
}

/*
	@param {Object} profile
	@returns {void}
*/
export function addProfile(profile) {
	profiles.push(profile)
	renderProfileList()
	selectProfile(profiles.length - 1)
}

/*
	@param {number} index
	@returns {void}
*/
export function deleteProfile(index) {
	profiles.splice(index, 1)
	
	if (selectedProfileIndex === index) {
		selectedProfileIndex = profiles.length > 0 ? 0 : -1
	} else if (selectedProfileIndex > index) {
		selectedProfileIndex--
	}
	
	renderProfileList()
	
	if (profiles.length > 0 && selectedProfileIndex !== -1) {
		selectProfile(selectedProfileIndex)
	} else {
		document.getElementById('currentProfileName').textContent = 'No Profile Selected'
		document.getElementById('currentProfileVersion').textContent = 'Version: -'
		document.getElementById('currentProfileMode').textContent = 'Mode: -'
	}
}

/*
	@returns {void}
*/
export async function handleEditProfile() {
	if (selectedProfileIndex === -1) return
	
	const p = profiles[selectedProfileIndex]
	document.getElementById('profileModalTitle').textContent = 'Edit Profile'
	document.getElementById('editingProfileIndex').value = selectedProfileIndex
	document.getElementById('pName').value = p.name
	
	const versionSelect = document.getElementById('pVersion')
	const existingOption = Array.from(versionSelect.options).find(opt => opt.value === p.version)
	if (!existingOption) {
		const customOpt = document.createElement('option')
		customOpt.value = p.version
		customOpt.textContent = `${p.version} (Custom/Modded)`
		versionSelect.insertBefore(customOpt, versionSelect.firstChild)
	}
	versionSelect.value = p.version
	
	const ramSlider = document.getElementById('pRamSlider')
	const ramInput = document.getElementById('pRamInput')
	const globalRam = getCurrentSettings().ramMB || 4096
	const ramMB = p.settings?.ramMB || globalRam
	
	ramSlider.min = 0
	ramSlider.value = ramMB
	ramInput.min = 0
	ramInput.value = ramMB
	
	const javaVersionInput = document.getElementById('pJavaVersion')
	javaVersionInput.value = p.settings?.javaVersion || '17'

	document.getElementById('profileSettingsSection').classList.remove('hidden')
	document.getElementById('profileSettingsArrow').classList.add('rotate-180')
	
	document.getElementById('pRamHelp').textContent = `Starts from global setting (${globalRam} MB), adjust as needed`
	
	document.getElementById('profileModal').classList.remove('hidden')
}

/*
	@returns {void}
*/
export async function updatePreview() {
	if (selectedProfileIndex === -1) {
		document.getElementById('noProfileSelected').classList.remove('hidden')
		document.getElementById('profilePreviewDetails').classList.add('hidden')
		return
	}

	const p = profiles[selectedProfileIndex]
	document.getElementById('noProfileSelected').classList.add('hidden')
	document.getElementById('profilePreviewDetails').classList.remove('hidden')

	document.getElementById('previewVersion').textContent = p.version
	document.getElementById('previewRam').textContent = p.settings?.ramMB ? `${p.settings.ramMB} MB` : 'Global Setting'
	
	const settings = await window.api.getSettings()
	document.getElementById('varGamePath').textContent = settings.gamePath || '-'
	document.getElementById('varJavaVersion').textContent = p.settings?.javaVersion || '17'
	document.getElementById('varRam').textContent = p.settings?.ramMB ? `${p.settings.ramMB} MB` : '4096 MB (Global)'
	
	const modsListElement = document.getElementById('modsList')
	const modsContainer = modsListElement.parentElement
	
	if (p.isCustom) {
		modsContainer.classList.remove('hidden')
		const profileData = await window.api.getProfileData(p.version, settings.gamePath)
		if (profileData.success) {
			const { mods } = profileData.data
			
			document.getElementById('modCount').textContent = mods.length
			if (mods.length > 0) {
				modsListElement.className = "grid grid-cols-1 md:grid-cols-2 gap-2"
				modsListElement.innerHTML = mods.slice(0, 15).map(m => {
					const modName = m.name.replace('.jar', '').replace(/_/g, ' ').replace(/-/g, ' ')
					return `<div class="text-sm py-2 px-3 bg-neutral-800 rounded hover:bg-neutral-700 transition truncate" title="${modName}">${modName}</div>`
				}).join('')
				if (mods.length > 15) {
					modsListElement.innerHTML += `<div class="text-sm text-neutral-500 italic mt-2 text-center col-span-1 md:col-span-2">+${mods.length - 15} more mods...</div>`
				}
			} else {
				modsListElement.className = ""
				modsListElement.innerHTML = '<div class="text-sm text-neutral-500 italic">No mods installed</div>'
			}
		}
	} else {
		modsContainer.classList.add('hidden')
	}
}
