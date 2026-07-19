import { Banner, Button, HStack, SettingsSection, Skeleton, Text, VStack } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AdminPageFrame } from '../../components/AdminPageFrame.tsx';
import { DomainsField } from '../../components/DomainsField.tsx';
import {
  getTenantSettings,
  type TenantSettings as TenantSettingsRow,
  updateEmailDomains,
} from '../api/tenant-settings-client.ts';

const settingsKey = ['admin', 'tenant-settings'] as const;

export function TenantSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<TenantSettingsRow>({
    queryKey: settingsKey,
    queryFn: () => getTenantSettings(),
  });

  const [domains, setDomains] = useState<string[]>([]);
  const [domainsSaved, setDomainsSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setDomains(data.email_domains ?? []);
    }
  }, [data]);

  const saveDomainsM = useMutation({
    mutationFn: (next: string[]) => updateEmailDomains(next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKey });
      setDomainsSaved(true);
      setTimeout(() => setDomainsSaved(false), 3000);
    },
  });

  return (
    <AdminPageFrame crumb="General" title="General">
      {error && <Banner status="error" title={(error as Error).message} />}
      <SettingsSection
        title="Email domains"
        description="Used to generate work email addresses for new people."
      >
        <VStack gap={3} paddingBlock={4}>
          {isLoading ? (
            <Skeleton height={36} />
          ) : (
            <>
              <DomainsField domains={domains} onChange={setDomains} />
              {saveDomainsM.error && (
                <Text style={{ color: 'var(--color-error)' }} display="block">
                  {(saveDomainsM.error as Error).message}
                </Text>
              )}
              {domainsSaved && (
                <Text style={{ color: 'var(--color-success)' }} display="block">
                  Email domains saved.
                </Text>
              )}
              <HStack hAlign="end">
                <Button
                  variant="primary"
                  label="Save"
                  onClick={() => saveDomainsM.mutate(domains)}
                  isDisabled={saveDomainsM.isPending}
                />
              </HStack>
            </>
          )}
        </VStack>
      </SettingsSection>
    </AdminPageFrame>
  );
}
