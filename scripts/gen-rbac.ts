import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderModuleRbac, renderPermissionKeys } from '../packages/shared-rbac/src/codegen.ts';
import { INVENTORY } from '../packages/shared-rbac/src/inventory.ts';
import { canonicalKeys } from '../packages/shared-rbac/src/manifest.ts';

const keys = INVENTORY.flatMap((m) => canonicalKeys(m.statement)).sort();
writeFileSync(
  resolve(import.meta.dirname, '../packages/shared-rbac/src/generated/permission-keys.ts'),
  renderPermissionKeys(keys),
);
for (const spec of INVENTORY) {
  writeFileSync(
    resolve(import.meta.dirname, `../packages/${spec.module}/src/generated/rbac.ts`),
    renderModuleRbac(spec),
  );
}
console.log(`wrote ${keys.length} permission keys + ${INVENTORY.length} module files`);
