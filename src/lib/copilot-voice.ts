export interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
export interface RecognitionEvent {
  results: { length: number; [index: number]: RecognitionResult };
}
export interface VoiceRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => VoiceRecognition;
  webkitSpeechRecognition?: new () => VoiceRecognition;
};
export function recognitionConstructor() {
  const w = window as VoiceWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}
export function stopRecognition(value: VoiceRecognition | null) {
  if (!value) return;
  value.onresult = value.onerror = value.onend = null;
  try {
    value.abort();
  } catch {
    /* An already stopped browser session is harmless. */
  }
}
export function recognizedText(event: RecognitionEvent) {
  let text = "";
  for (let i = 0; i < event.results.length; i++)
    text += event.results[i][0].transcript;
  return text.trim();
}
