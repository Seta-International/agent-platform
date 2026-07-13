import { Button } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as stylex from '@stylexjs/stylex';
import { setaTheme } from './astryx-seta.theme';

// Proves the full pipeline end to end: custom theme tokens resolve, the
// StyleX compiler processes a real xstyle override, and the compiled CSS
// renders through the astryx-base/astryx-theme layers wired in Task 3.
// This story is a permanent build-pipeline health check, not scaffolding —
// keep it even after primitive migration adds real component stories here.
const smokeStyles = stylex.create({
  probe: {
    marginBlock: 24,
  },
});

function AstryxPipelineProbe() {
  return (
    <Theme theme={setaTheme} mode="light">
      <Button
        label="Astryx pipeline OK"
        variant="primary"
        xstyle={smokeStyles.probe}
        onClick={() => {}}
      />
    </Theme>
  );
}

const meta: Meta<typeof AstryxPipelineProbe> = {
  title: 'Foundation/Astryx Pipeline',
  component: AstryxPipelineProbe,
};
export default meta;

export const Default: StoryObj<typeof AstryxPipelineProbe> = {};
