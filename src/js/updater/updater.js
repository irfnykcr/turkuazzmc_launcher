const updateStatus = document.getElementById('updateStatus')
const progressBar = document.getElementById('progressBar')
const progressPercentage = document.getElementById('progressPercentage')
const restartButton = document.getElementById('restartButton')

let downloadComplete = false

window.api.onLog((data) => {
	console.log(`[Update Log] Instance ${data.instanceId}: ${data.message}`)
})

updateStatus.textContent = 'Preparing to download update...'

window.api.downloadUpdate().then((success) => {
	if (success) {
		downloadComplete = true
		updateStatus.textContent = 'Update downloaded successfully!'
		progressBar.style.width = '100%'
		progressPercentage.textContent = '100%'
		restartButton.disabled = false
		restartButton.classList.add('animate-pulse')
	} else {
		updateStatus.textContent = 'Failed to download update'
		progressBar.classList.remove('bg-blue-600')
		progressBar.classList.add('bg-red-600')
	}
}).catch((error) => {
	updateStatus.textContent = `Error: ${error.message || error}`
	progressBar.classList.remove('bg-blue-600')
	progressBar.classList.add('bg-red-600')
})

restartButton.addEventListener('click', () => {
	if (downloadComplete) {
		updateStatus.textContent = 'Installing update and restarting...'
		restartButton.disabled = true
		window.api.installUpdate()
	}
})

window.api.onUpdateProgress((progressData) => {
	progressBar.style.width = `${progressData.percent}%`
	progressPercentage.textContent = progressData.text || `${progressData.percent}%`
})

window.api.onUpdateDownloaded(() => {
	downloadComplete = true
	updateStatus.textContent = 'Update downloaded successfully!'
	restartButton.disabled = false
	restartButton.classList.add('animate-pulse')
})

window.api.onUpdateError((errorMsg) => {
	updateStatus.textContent = `Error: ${errorMsg}`
	progressBar.classList.remove('bg-blue-600')
	progressBar.classList.add('bg-red-600')
})

window.addEventListener('update-error', (event, error) => {
	updateStatus.textContent = `Update error: ${error}`
	progressBar.classList.remove('bg-blue-600')
	progressBar.classList.add('bg-red-600')
})
