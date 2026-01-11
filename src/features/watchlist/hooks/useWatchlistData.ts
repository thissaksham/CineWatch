import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../auth/context/AuthContext';
import type { WatchlistItem } from '../../../types';
import { getLocalStorageItem } from '../../../utils/localStorage';

export function useWatchlistData() {
    const { user } = useAuth();

    return useQuery<WatchlistItem[]>({
        queryKey: ['watchlist', user?.id || 'local'],
        queryFn: async () => {
            if (!user) {
                // Use safe localStorage parsing with fallback
                return getLocalStorageItem<WatchlistItem[]>('watchlist', []);
            }

            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        // Refetch when window regains focus (good for syncing)
        refetchOnWindowFocus: true,
    });
}
