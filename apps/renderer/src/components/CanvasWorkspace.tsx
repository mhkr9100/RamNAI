import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PenTool, Sparkles, Loader2 } from 'lucide-react';
import { getDesktopApi } from '@/lib/electron';
import { Badge, Card, SectionLabel } from './ui';

interface CanvasWorkspaceProps {
  busy: boolean;
}

interface CanvasStatus {
  available: boolean;
  version: string | null;
}

export function CanvasWorkspace({ busy }: CanvasWorkspaceProps) {
  const [status, setStatus] = useState<CanvasStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const api = getDesktopApi();
    api.bridge.getStatus().then((gatewayStatus: { running: boolean; version?: string } | null) => {
      setStatus({
        available: gatewayStatus?.running ?? false,
        version: gatewayStatus?.version ?? null,
      });
    }).catch(() => {
      setStatus({ available: false, version: null });
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-surface-0 px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md text-center"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/[0.06] bg-surface-2">
          <PenTool size={36} className="text-white/20" />
        </div>

        <h2 className="text-xl font-semibold text-white mb-2">Live Canvas</h2>
        <p className="text-sm text-white/40 mb-6 leading-relaxed">
          Agent-driven visual workspace powered by A2UI. Generate diagrams, wireframes,
          and visual artifacts directly from agent outputs.
        </p>

        <Card className="bg-surface-2 p-5 text-left space-y-4">
          <SectionLabel>STATUS</SectionLabel>

          {loading ? (
            <div className="flex items-center gap-2 text-white/30">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[12px]">Checking runtime...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-white/50">Runtime Bridge</span>
                <Badge variant={status?.available ? 'brand' : 'default'} size="xs">
                  {status?.available ? 'Running' : 'Offline'}
                </Badge>
              </div>
              {status?.version && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white/50">Version</span>
                  <span className="text-[12px] text-white/40">{status.version}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-white/50">Canvas Engine</span>
                <Badge variant="default" size="xs">Requires Setup</Badge>
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-surface-2 p-5 text-left space-y-3 mt-3">
          <SectionLabel>PLANNED CAPABILITIES</SectionLabel>
          <div className="space-y-2">
            {[
              'Agent-generated diagrams & wireframes',
              'Real-time collaborative canvas',
              'Export to SVG, PNG, and PDF',
              'A2UI visual component rendering',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Sparkles size={10} className="text-brand-light shrink-0" />
                <span className="text-[12px] text-white/45">{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
