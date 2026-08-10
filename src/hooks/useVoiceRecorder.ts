import { useCallback } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

export type StartResult = 'started' | 'permission_denied';

export interface StopResult {
  uri: string | null;
  durationMillis: number;
}

/** Records a single meal-description clip to a local m4a file. Recordings are not kept —
 * the caller transcribes the file then deletes it (see PROJECT_PLAN.md §7). */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);

  const start = useCallback(async (): Promise<StartResult> => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return 'permission_denied';
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return 'started';
  }, [recorder]);

  /** Stops recording and returns the local file URI plus the final recorded duration — the
   * caller uses the duration to reject near-instant taps before they ever hit the network. */
  const stop = useCallback(async (): Promise<StopResult> => {
    await recorder.stop();
    // recorder.currentTime is the authoritative post-stop duration, but fall back to the last
    // polled hook value defensively in case it resets before this read lands.
    const durationMillis = Math.max(recorder.currentTime * 1000, state.durationMillis);
    return { uri: recorder.uri, durationMillis };
  }, [recorder, state.durationMillis]);

  return {
    isRecording: state.isRecording,
    durationMillis: state.durationMillis,
    start,
    stop,
  };
}
