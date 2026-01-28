export let currentSettings = {}
export let ramAllocation = 2048
export let hideLauncher = false
export let exitAfterLaunch = false

/*
	@param {Object} settings
	@returns {void}
*/
export function setCurrentSettings(settings) {
	currentSettings = settings
}

/*
	@param {number} ram
	@returns {void}
*/
export function setRamAllocation(ram) {
	ramAllocation = ram
}

/*
	@returns {number}
*/
export function getRamAllocation() {
	return ramAllocation
}

/*
	@param {boolean} value
	@returns {void}
*/
export function setHideLauncher(value) {
	hideLauncher = value
}

/*
	@returns {boolean}
*/
export function getHideLauncher() {
	return hideLauncher
}

/*
	@param {boolean} value
	@returns {void}
*/
export function setExitAfterLaunch(value) {
	exitAfterLaunch = value
}

/*
	@returns {boolean}
*/
export function getExitAfterLaunch() {
	return exitAfterLaunch
}

/*
	@returns {Object}
*/
export function getCurrentSettings() {
	return currentSettings
}

/*
	@returns {void}
*/
export function showSettings() {
	document.getElementById('gamePathInput').value = currentSettings.gamePath || ''
	document.getElementById('javaPathInput').value = currentSettings.javaPath || 'java'
	document.getElementById('ramSlider').value = ramAllocation
	document.getElementById('ramInput').value = ramAllocation
	document.getElementById('hideLauncherCheckbox').checked = hideLauncher
	document.getElementById('exitAfterLaunchCheckbox').checked = exitAfterLaunch
	document.getElementById('exitAfterLaunchCheckbox').disabled = !hideLauncher
	document.getElementById('settingsModal').classList.remove('hidden')
}

/*
	@returns {void}
*/
export function closeSettings() {
	document.getElementById('settingsModal').classList.add('hidden')
}

/*
	@returns {Promise<void>}
*/
export async function browseGamePath() {
	const folder = await window.api.selectFolder()
	if (folder) {
		document.getElementById('gamePathInput').value = folder
	}
}

/*
	@returns {Object}
*/
export function getSettingsFormData() {
	return {
		gamePath: document.getElementById('gamePathInput').value,
		javaPath: document.getElementById('javaPathInput').value,
		ramAllocation: parseInt(document.getElementById('ramInput').value),
		hideLauncher: document.getElementById('hideLauncherCheckbox').checked,
		exitAfterLaunch: document.getElementById('exitAfterLaunchCheckbox').checked
	}
}
