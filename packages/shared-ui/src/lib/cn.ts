import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'body',
            'body-sm',
            'body-lg',
            'caption',
            'eyebrow',
            'button',
            'mono',
            'subhead',
            'card-title',
            'headline',
            'display-md',
            'display-lg',
            'display-xl',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
