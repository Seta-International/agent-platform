import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import '../src/styles/tokens.css';
import '../src/styles/fonts.css';
import '../src/styles/globals.css';
import './preview.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: 'theme-light', dark: 'theme-dark' },
      defaultTheme: 'light',
    }),
  ],
};

export default preview;
