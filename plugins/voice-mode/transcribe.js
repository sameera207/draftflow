// Sends audio to OpenAI Whisper and returns the transcript string.
// Uses api.network.fetch() so the origin allowedOrigins check is enforced.
async function transcribe(audioBlob, apiKey, api) {
  const formData = new FormData()
  formData.append('file',  audioBlob, 'audio.webm')
  formData.append('model', 'whisper-1')

  const response = await api.network.fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body:    formData,
    }
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      `Whisper API error ${response.status}: ${err?.error?.message ?? 'unknown error'}`
    )
  }

  const data = await response.json()

  if (typeof data.text !== 'string') {
    throw new Error('Whisper API returned unexpected response shape')
  }

  return data.text.trim()
}

module.exports = { transcribe }
