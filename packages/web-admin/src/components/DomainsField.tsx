import { Badge, Button, HStack, IconButton, Input, VStack } from '@seta/shared-ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

interface DomainsFieldProps {
  domains: string[];
  onChange: (next: string[]) => void;
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
    <VStack gap={2}>
      <HStack gap={2}>
        <Input
          label="Email domains"
          value={input}
          onChange={(value) => setInput(value)}
          placeholder="contoso.com"
          onEnter={add}
        />
        <Button
          type="button"
          variant="secondary"
          icon={<Plus className="size-4" />}
          label="Add"
          onClick={add}
        />
      </HStack>
      {domains.length > 0 && (
        <HStack gap={1} wrap="wrap">
          {domains.map((d) => (
            <Badge
              key={d}
              variant="neutral"
              className="gap-1" // keep: spaces the Badge's inline label content (text + remove IconButton); no Stack fits inside a bare ReactNode label
              label={
                <>
                  {d}
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={`Remove ${d}`}
                    onClick={() => remove(d)}
                    icon={<X className="size-3" />}
                  />
                </>
              }
            />
          ))}
        </HStack>
      )}
    </VStack>
  );
}
