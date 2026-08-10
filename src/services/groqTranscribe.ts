import { env } from '../utils/env';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
// Turbo over plain large-v3: several times faster for near-identical accuracy on short,
// single-speaker clips like a spoken meal description — matters for logging-flow latency.
const MODEL = 'whisper-large-v3-turbo';

interface GroqTranscriptionResponse {
  text: string;
}

/** Uploads a local audio file (m4a) to Groq's Whisper endpoint and returns the transcript. */
export async function transcribeAudio(fileUri: string): Promise<string> {
  const formData = new FormData();
  // React Native's fetch/FormData accepts this {uri,name,type} shape for file uploads and
  // sets the multipart Content-Type + boundary automatically — do not set it manually.
  formData.append('file', {
    uri: fileUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  formData.append('model', MODEL);
  formData.append('response_format', 'json');
  formData.append('language', 'en');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.groqApiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq transcription failed (${response.status}): ${errText}`);
  }

  const data: GroqTranscriptionResponse = await response.json();
  return data.text.trim();
}
