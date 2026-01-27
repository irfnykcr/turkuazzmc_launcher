export let profiles = []
export let selectedProfileIndex = -1

export function setProfiles(newProfiles) {
	profiles = newProfiles
}

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

export function selectProfile(index) {
	selectedProfileIndex = index
	const p = profiles[index]
	document.getElementById('currentProfileName').textContent = p.name
	document.getElementById('currentProfileVersion').textContent = `Version: ${p.version}`
	document.getElementById('currentProfileMode').textContent = `Ready`
	renderProfileList()
}

export function showCreateProfile() {
	document.getElementById('profileModal').classList.remove('hidden')
	document.getElementById('pName').value = `My Profile ${profiles.length + 1}`
}

export function addProfile(profile) {
	profiles.push(profile)
	renderProfileList()
	selectProfile(profiles.length - 1)
}

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
