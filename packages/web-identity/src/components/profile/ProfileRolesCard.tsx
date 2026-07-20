import {
  Badge,
  HStack,
  pixel,
  proportional,
  Table,
  type TableColumn,
  Text,
  VStack,
} from '@seta/shared-ui';

interface RoleRow extends Record<string, unknown> {
  slug: string;
}

const columns: TableColumn<RoleRow>[] = [
  {
    key: 'slug',
    header: 'Role',
    width: proportional(2),
    renderCell: (row) => <Text className="font-mono text-sm">{row.slug}</Text>,
  },
  {
    key: 'scope',
    header: 'Scope',
    width: proportional(1),
    renderCell: () => <Text color="secondary">Organization</Text>,
  },
  {
    key: 'assignment',
    header: 'Assignment',
    width: pixel(120),
    align: 'end',
    renderCell: () => <Badge label="Manual" />,
  },
];

export function ProfileRolesCard({ roles }: { roles: string[] }) {
  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="start" gap={4}>
        <Text color="secondary">
          What you can see and change in this app. Need a different role?{' '}
          <Text weight="semibold">Ask your admin</Text>.
        </Text>
        <Text type="supporting" color="secondary">
          Your admin manages these.
        </Text>
      </HStack>

      {roles.length === 0 ? (
        <Text type="supporting" color="secondary">
          No roles yet.
        </Text>
      ) : (
        <Table
          data={roles.map((slug) => ({ slug }))}
          columns={columns}
          dividers="rows"
          density="compact"
        />
      )}
    </VStack>
  );
}
