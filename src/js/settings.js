export let currentSettings = {}
export let ramAllocation = 2048

export function setCurrentSettings(settings) {
    currentSettings = settings
}

export function setRamAllocation(ram) {
    ramAllocation = ram
}

export function getRamAllocation() {
    return ramAllocation
}

export function getCurrentSettings() {
    return currentSettings
}

export function showSettings() {
    document.getElementById('gamePathInput').value = currentSettings.gamePath || ''
    document.getElementById('javaPathInput').value = currentSettings.javaPath || 'java'
    document.getElementById('ramSlider').value = ramAllocation
    document.getElementById('ramInput').value = ramAllocation
    document.getElementById('settingsModal').classList.remove('hidden')
}

export function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden')
}

export async function browseGamePath() {
    const folder = await window.api.selectFolder()
    if (folder) {
        document.getElementById('gamePathInput').value = folder
    }
}

export function getSettingsFormData() {
    return {
        gamePath: document.getElementById('gamePathInput').value,
        javaPath: document.getElementById('javaPathInput').value,
        ramAllocation: parseInt(document.getElementById('ramInput').value)
    }
}
