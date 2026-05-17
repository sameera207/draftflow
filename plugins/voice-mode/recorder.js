let mediaRecorder = null
let audioChunks   = []

// Returns Promise<Blob> (audio/webm) when stopRecording() is called.
// Rejects if microphone access is denied.
async function startRecording() {
  audioChunks = []

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })

  return new Promise((resolve, reject) => {
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      resolve(new Blob(audioChunks, { type: 'audio/webm' }))
    }

    mediaRecorder.onerror = (e) => reject(e.error)

    mediaRecorder.start()
  })
}

// No-op if not currently recording.
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

module.exports = { startRecording, stopRecording }
