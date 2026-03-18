import type { ChatRouteMetadata } from '@supreme/shared';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatStatusTone = 'ready' | 'active' | 'warning';

export interface ChatStatusBadge {
  label: string;
  tone: ChatStatusTone;
}

export interface ChatTranscriptMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  label?: string;
  timestamp?: string;
  mentions?: string[];
  route?: ChatRouteMetadata;
}

export interface PersistentChatbotIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  modelLabel?: string;
  providerLabel?: string;
  statusLabel?: string;
  runtimeStatus?: ChatStatusBadge;
  threadStatus?: ChatStatusBadge;
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
  runtimeStatus?: ChatStatusBadge;
  threadStatus?: ChatStatusBadge;
  routingMode?: 'manual' | 'auto';
}
