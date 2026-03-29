/* Web Speech API type augmentation for Electron/Chromium */
declare global {
  interface Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

declare const SpeechRecognition: { new(): SpeechRecognition };

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, X, Sparkles, Settings2, AlertCircle } from 'lucide-react';
import type { VoiceState, VoiceEvent, VoiceConfig } from '@raman-ai/shared';
import { getDesktopApi } from '@/lib/electron';
import { Badge, Button, Card, SectionLabel, Input, Select } from './ui';

interface VoicePanelProps {
  open: boolean;
  onClose: () => void;
  agentId?: string | undefined;
  agentName?: string | undefined;
}

const TTS_PROVIDER_OPTIONS = [
  { value: 'system', label: 'System TTS' },
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
];

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  wakeWord: 'Hey Raman AI',
  preferredVoice: 'Nova',
  autoListen: false,
  ttsProvider: 'system',
};

export function VoicePanel({ open, onClose, agentId, agentName }: VoicePanelProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [events, setEvents] = useState<VoiceEvent[]>([]);
  const [config, setConfig] = useState<VoiceConfig>(DEFAULT_VOICE_CONFIG);
  const [configDraft, setConfigDraft] = useState<VoiceConfig>(DEFAULT_VOICE_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    try {
      const api = getDesktopApi();
      const voice = api?.voice;
      if (!voice?.getConfig) {
        setConfig(DEFAULT_VOICE_CONFIG);
        setConfigDraft(DEFAULT_VOICE_CONFIG);
        return;
      }
      voice.getConfig().then((cfg: VoiceConfig) => {
        setConfig(cfg ?? DEFAULT_VOICE_CONFIG);
        setConfigDraft(cfg ?? DEFAULT_VOICE_CONFIG);
      }).catch(() => {
        setConfig(DEFAULT_VOICE_CONFIG);
        setConfigDraft(DEFAULT_VOICE_CONFIG);
        setError('Failed to load voice configuration');
      });
    } catch {
      setConfig(DEFAULT_VOICE_CONFIG);
      setConfigDraft(DEFAULT_VOICE_CONFIG);
      setError('Voice mode is unavailable');
    }
  }, [open]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setPermissionGranted(true);
      return true;
    } catch {
      setPermissionGranted(false);
      setError('Microphone access denied. Grant permission in System Settings.');
      return false;
    }
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    const hasPermission = permissionGranted ?? await requestMicPermission();
    if (!hasPermission) return;

    const SpeechRecognitionAPI = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported in this environment.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last?.[0]) {
        const transcript = last[0].transcript;
        if (last.isFinal) {
          setEvents((prev) => [...prev, { type: 'transcript', text: transcript, timestamp: Date.now(), agentId }]);
          const api = getDesktopApi();
          setVoiceState('processing');
          api.voice.sendTranscript(transcript, agentId).then((response: VoiceEvent) => {
            setEvents((prev) => [...prev, response]);
            setVoiceState('idle');
          }).catch(() => {
            setError('Failed to process voice input');
            setVoiceState('idle');
          });
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(`Speech recognition error: ${event.error}`);
      setVoiceState('idle');
    };

    recognition.onend = () => {
      if (voiceState === 'listening') {
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceState('listening');
  }, [permissionGranted, requestMicPermission, agentId, voiceState]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setVoiceState('idle');
  }, []);

  const toggleListening = useCallback(() => {
    if (voiceState === 'idle') {
      void startListening();
    } else if (voiceState === 'listening') {
      stopListening();
    }
  }, [voiceState, startListening, stopListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handleSaveConfig = useCallback(async () => {
    try {
      const api = getDesktopApi();
      const voice = api?.voice;
      if (voice?.setConfig) {
        await voice.setConfig(configDraft);
      }
      setConfig(configDraft);
      setShowSettings(false);
    } catch {
      setError('Failed to save voice configuration');
    }
  }, [configDraft]);

  const pulseClass = voiceState === 'listening' ? 'animate-pulse' : '';
  const ringColor =
    voiceState === 'listening'
      ? 'border-green-500/50 bg-green-500/10'
      : voiceState === 'processing'
        ? 'border-yellow-500/50 bg-yellow-500/10'
        : voiceState === 'speaking'
          ? 'border-brand/50 bg-brand/10'
          : 'border-black/10 dark:border-white/[0.08] bg-surface-3';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] bg-black/40"
            onClick={onClose}
            aria-label="Click to close"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto max-w-lg rounded-t-3xl border border-black/10 dark:border-white/[0.12] bg-white dark:bg-surface-1 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-black/8 dark:border-white/[0.06] px-5 py-3">
              <div className="flex items-center gap-3">
                <Volume2 size={16} className="text-brand-light" />
                <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  Voice {agentName ? `— ${agentName}` : 'Mode'}
                </span>
                <Badge variant={voiceState === 'idle' ? 'default' : 'brand'} size="xs">
                  {voiceState.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                  title="Voice settings"
                >
                  <Settings2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                  aria-label="Close voice panel"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="px-5 py-6">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#f87171]/20 bg-[#f87171]/[0.06] px-4 py-2.5">
                  <AlertCircle size={14} className="shrink-0 text-[#f87171]" />
                  <p className="text-xs text-red-600 dark:text-[#fca5a5]">{error}</p>
                </div>
              )}

              {showSettings ? (
                <div className="space-y-4">
                  <SectionLabel>VOICE SETTINGS</SectionLabel>
                  <Input
                    label="Wake Word"
                    value={configDraft.wakeWord}
                    onChange={(e) => setConfigDraft((c) => c ? { ...c, wakeWord: e.target.value } : c)}
                  />
                  <Input
                    label="Preferred Voice"
                    value={configDraft.preferredVoice}
                    onChange={(e) => setConfigDraft((c) => c ? { ...c, preferredVoice: e.target.value } : c)}
                  />
                  <Select
                    label="TTS Provider"
                    value={configDraft.ttsProvider}
                    onChange={(e) => setConfigDraft((c) => c ? { ...c, ttsProvider: e.target.value as VoiceConfig['ttsProvider'] } : c)}
                    options={TTS_PROVIDER_OPTIONS}
                  />
                  <Button variant="brand" size="sm" className="w-full" onClick={handleSaveConfig}>
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-6">
                  <button
                    type="button"
                    onClick={toggleListening}
                    disabled={voiceState === 'processing' || voiceState === 'speaking'}
                    className={[
                      'flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all duration-300',
                      ringColor,
                      pulseClass,
                      (voiceState === 'processing' || voiceState === 'speaking') ? 'opacity-50 cursor-not-allowed' : '',
                    ].join(' ')}
                    aria-label={voiceState === 'listening' ? 'Stop listening' : 'Start listening'}
                  >
                    {voiceState === 'listening' ? (
                      <MicOff size={32} className="text-green-400" />
                    ) : (
                      <Mic size={32} className="text-slate-400 dark:text-white/50" />
                    )}
                  </button>

                  <p className="text-sm text-slate-400 dark:text-white/40 text-center">
                    {voiceState === 'idle' && 'Tap to start speaking'}
                    {voiceState === 'listening' && 'Listening... Tap to stop'}
                    {voiceState === 'processing' && 'Processing your input...'}
                    {voiceState === 'speaking' && 'Agent is responding...'}
                  </p>

                  <div className="flex items-center gap-2 rounded-xl border border-black/8 dark:border-white/[0.06] bg-surface-3 px-4 py-2">
                    <Sparkles size={12} className="text-brand-light" />
                    <span className="text-[11px] text-slate-400 dark:text-white/35">
                      Wake word: <span className="text-slate-600 dark:text-white/60 font-medium">&ldquo;{config.wakeWord}&rdquo;</span>
                    </span>
                  </div>

                  {events.length > 0 && (
                    <Card className="w-full bg-surface-3 p-4 max-h-40 overflow-y-auto custom-scrollbar">
                      <SectionLabel className="mb-2">TRANSCRIPT</SectionLabel>
                      <div className="space-y-2">
                        {events.map((evt, i) => (
                          <div key={i} className="text-sm text-slate-600 dark:text-white/60">
                            <span className="text-[10px] font-semibold uppercase text-slate-400 dark:text-white/30 mr-2">
                              {evt.type}
                            </span>
                            {evt.text}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
