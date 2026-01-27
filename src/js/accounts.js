export let savedAccounts = []
export let currentAuth = null

export function setSavedAccounts(accounts) {
	savedAccounts = accounts
}

export function setCurrentAuth(auth) {
	currentAuth = auth
}

export function getCurrentAuth() {
	return currentAuth
}

export function updateAccountUI() {
	if(!currentAuth) {
		document.getElementById('accountName').textContent = "No Account"
		document.getElementById('accountType').textContent = "Select Account"
		document.getElementById('accountType').className = "text-[10px] uppercase font-bold text-red-500"
		document.getElementById('accountAvatar').src = "https://mc-heads.net/avatar/MHF_Steve"
		document.getElementById('accountAvatar').className = "w-8 h-8 rounded border-2 border-red-500 bg-neutral-600"
		return
	}

	document.getElementById('accountName').textContent = currentAuth.name
	
	const isOnline = currentAuth.type === 'ms'
	const typeLabel = isOnline ? 'Online Account' : 'Offline Account'
	const typeColor = isOnline ? 'text-green-500' : 'text-neutral-500'
	const avatarBorder = isOnline ? 'border-green-500' : 'border-neutral-500'
	
	const typeEl = document.getElementById('accountType')
	typeEl.textContent = typeLabel
	typeEl.className = `text-[10px] uppercase font-bold ${typeColor} flex items-center gap-1`
	
	typeEl.innerHTML = `<span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-neutral-500'} inline-block"></span> ${typeLabel}`

	const avatarUrl = `https://mc-heads.net/avatar/${currentAuth.name}`
	const avatar = document.getElementById('accountAvatar')
	avatar.src = avatarUrl
	avatar.className = `w-8 h-8 rounded border-2 ${avatarBorder}`
}

export function renderAccountList() {
	const container = document.getElementById('savedAccountsList')
	container.innerHTML = ''

	if (savedAccounts.length === 0) {
		container.innerHTML = `<div class="text-center text-neutral-500 mt-10 italic">No saved accounts</div>`
		return
	}

	const onlineAccs = savedAccounts.filter(a => a.type === 'ms')
	const offlineAccs = savedAccounts.filter(a => a.type === 'offline')

	const createGroup = (title, list) => {
		if(list.length === 0) return
		
		const groupTitle = document.createElement('div')
		groupTitle.className = "text-xs font-bold text-neutral-400 mt-4 mb-2 uppercase px-2"
		groupTitle.textContent = title
		container.appendChild(groupTitle)

		list.forEach((acc) => {
			const el = document.createElement('div')
			const isActive = isCurrentAccount(acc)
			const activeClass = isActive ? 'bg-neutral-700 border-green-500' : 'bg-neutral-800 hover:bg-neutral-750 border-transparent'
			
			el.className = `flex items-center justify-between p-3 rounded border-l-4 mb-2 cursor-pointer transition ${activeClass}`
			el.onclick = () => window.switchAccountHandler(acc)

			const avatarUrl = `https://mc-heads.net/avatar/${acc.name}`
			
			el.innerHTML = `
				<div class="flex items-center gap-3">
					<img src="${avatarUrl}" class="w-8 h-8 rounded bg-neutral-600">
					<div class="flex flex-col">
						<span class="font-bold text-white text-sm leading-tight">${acc.name}</span>
						<span class="text-[10px] text-neutral-400 leading-tight">${acc.type === 'ms' ? 'Microsoft' : 'Offline'}</span>
					</div>
				</div>
				<button class="text-neutral-500 hover:text-red-500 p-2 del-btn transition" title="Delete">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
				</button>
			`
			
			el.querySelector('.del-btn').onclick = (e) => {
				e.stopPropagation()
				window.removeAccountHandler(acc)
			}

			container.appendChild(el)
		})
	}

	createGroup('Microsoft Accounts', onlineAccs)
	createGroup('Offline Accounts', offlineAccs)
}

function isCurrentAccount(acc) {
	if (!currentAuth || acc.type !== currentAuth.type) return false
	if (acc.type === 'ms') return acc.uuid === currentAuth.uuid
	if (acc.type === 'offline') return acc.name === currentAuth.name
	return false
}

export function addAccountToState(acc) {
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

export function removeAccountFromState(acc) {
	if(acc.type === 'ms') {
		savedAccounts = savedAccounts.filter(a => !(a.type === 'ms' && a.uuid === acc.uuid))
	} else {
		savedAccounts = savedAccounts.filter(a => !(a.type === 'offline' && a.name === acc.name))
	}

	const isActive = acc.type === currentAuth?.type && 
					 (acc.type === 'ms' ? acc.uuid === currentAuth.uuid : acc.name === currentAuth.name)

	if(isActive) {
		if(savedAccounts.length > 0) {
			currentAuth = savedAccounts[0]
		} else {
			currentAuth = null
		}
	}

	return savedAccounts
}
