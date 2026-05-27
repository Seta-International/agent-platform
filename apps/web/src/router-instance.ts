import { QueryClient } from '@tanstack/react-query';
import { createAppRouter } from './router';

export const queryClient = new QueryClient();
export const router = createAppRouter(queryClient);
