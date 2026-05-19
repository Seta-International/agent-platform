'use client';

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/theme/theme-provider';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-canvas group-[.toaster]:text-ink group-[.toaster]:border-hairline group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-ink-subtle',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-on-primary',
          cancelButton: 'group-[.toast]:bg-surface-2 group-[.toast]:text-ink-subtle',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
