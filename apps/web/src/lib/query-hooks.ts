import {
  useMutation,
  useQuery,
  type MutationKey,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/types/api';

export interface ApiClientError {
  message: string;
  statusCode?: number;
}

function isAxiosError(error: unknown): error is AxiosError<ApiResponse<unknown>> {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

export function normalizeApiError(error: unknown): ApiClientError {
  if (isAxiosError(error)) {
    return {
      message: error.response?.data?.message ?? error.message,
      statusCode: error.response?.status,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'Unknown error' };
}

type ApiQueryOptions<TData, TQueryKey extends QueryKey> = Omit<
  UseQueryOptions<TData, ApiClientError, TData, TQueryKey>,
  'queryFn'
> & {
  queryFn: () => Promise<TData>;
};

export function useApiQuery<TData, TQueryKey extends QueryKey>(
  options: ApiQueryOptions<TData, TQueryKey>,
) {
  const { queryFn, ...rest } = options;

  return useQuery<TData, ApiClientError, TData, TQueryKey>({
    ...rest,
    queryFn: async () => {
      try {
        return await queryFn();
      } catch (error) {
        throw normalizeApiError(error);
      }
    },
  });
}

type ApiMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiClientError, TVariables>,
  'mutationFn'
> & {
  mutationFn: (variables: TVariables) => Promise<TData>;
  mutationKey?: MutationKey;
};

export function useApiMutation<TData, TVariables>(
  options: ApiMutationOptions<TData, TVariables>,
) {
  const { mutationFn, ...rest } = options;

  return useMutation<TData, ApiClientError, TVariables>({
    ...rest,
    mutationFn: async (variables) => {
      try {
        return await mutationFn(variables);
      } catch (error) {
        throw normalizeApiError(error);
      }
    },
  });
}
