import { Badge, Button, Input } from '@seta/shared-ui';
import { useState } from 'react';

interface DomainsFieldProps {
  domains: string[];
  onChange: (next: string[]) => void;
  idPrefix?: string;
}

export function DomainsField({ domains, onChange }: DomainsFieldProps) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;
    if (!domains.includes(trimmed)) {
      onChange([...domains, trimmed]);
    }
    setInput('');
  }

  function remove(d: string) {
    onChange(domains.filter((x) => x !== d));
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          label="Email domains"
          value={input}
          onChange={(value) => setInput(value)}
          placeholder="contoso.com"
          onEnter={add}
        />
        <Button type="button" variant="secondary" label="Add" onClick={add} />
      </div>
      {domains.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {domains.map((d) => (
            <Badge
              key={d}
              variant="neutral"
              className="gap-1"
              label={
                <>
                  {d}
                  <button
                    type="button"
                    className="ml-1 hover:text-destructive"
                    onClick={() => remove(d)}
                    aria-label={`Remove ${d}`}
                  >
                    ×
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
