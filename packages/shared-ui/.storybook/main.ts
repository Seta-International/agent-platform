import type { StorybookConfig } from '@storybook/react-vite';
import stylex from '@stylexjs/unplugin';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
  typescript: { reactDocgen: false },
  async viteFinal(viteConfig) {
    viteConfig.plugins = [
      stylex.vite({
        useCSSLayers: {
          before: [
            'reset',
            'theme',
            'base',
            'astryx-base',
            'astryx-theme',
            'components',
            'utilities',
          ],
        },
        dev: true,
        runtimeInjection: false,
      }),
      ...(viteConfig.plugins ?? []),
      tailwindcss(),
    ];
    return viteConfig;
  },
};

export default config;
