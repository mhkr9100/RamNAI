export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatTranscriptMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  label?: string;
  timestamp?: string;
}

export interface PersistentChatbotIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  modelLabel?: string;
  providerLabel?: string;
  statusLabel?: string;
}

export interface MentionableParticipant {
  id: string;
  label: string;
  subtitle?: string;
  handle?: string;
}

export interface GroupChatIdentity {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
}

