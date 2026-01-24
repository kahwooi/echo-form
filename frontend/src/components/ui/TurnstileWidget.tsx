import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef } from 'react';

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
}

export function TurnstileWidget({ 
  siteKey, 
  onVerify, 
  onError,
  theme = 'light',
  size = 'normal' 
}: TurnstileWidgetProps) {
  const ref = useRef<TurnstileInstance>(null);

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      onSuccess={onVerify}
      onError={onError}
      options={{ theme, size }}
    />
  );
}
