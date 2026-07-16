import { useEffect, useState } from 'react';
import { onAiStatus, type AiStatus } from '../bootstrap';

const LABEL: Record<AiStatus, string> = {
  idle: 'Starting…',
  loading: 'Getting ready…',
  ready: 'Ready',
  error: 'Offline AI not installed',
};

export default function AiBadge() {
  const [status, setStatus] = useState<AiStatus>('idle');
  useEffect(() => onAiStatus(setStatus), []);

  const color =
    status === 'ready' ? '#8ff0c0' : status === 'error' ? '#ffb3b3' : '#ffe08a';

  return (
    <span
      title="The smart scanning & search run entirely on this device, with no internet."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 'var(--fs-sm)',
        fontWeight: 700,
        color: 'var(--brand-ink)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: color,
          boxShadow: '0 0 0 3px rgba(255,255,255,0.2)',
        }}
      />
      {LABEL[status]}
    </span>
  );
}
