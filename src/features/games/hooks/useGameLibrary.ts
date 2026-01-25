import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import type { Game, GameStatus } from '../../../types';
import { useAuth } from '../../auth/context/AuthContext';
import axios from 'axios';

const TABLE_NAME = 'games';

export const useGameLibrary = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // FETCH GAMES
    const { data: libraryGames = [], isLoading } = useQuery({
        queryKey: ['games-library', user?.id],
        queryFn: async () => {
            if (!user) return [];
            
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching games:', error);
                throw error;
            }

            return data as Game[];
        },
        enabled: !!user,
    });

    // ADD GAME (Check if exists first)
    const addGameMutation = useMutation({
        mutationFn: async (game: Game) => {
            if (!user) throw new Error('User not logged in');

            // Map frontend Game object to DB schema
            const rawgId = game.rawg_id || (typeof game.id === 'string' && game.id.startsWith('rawg-') ? parseInt(game.id.replace('rawg-', '')) : game.igdb_id);

            // Fetch Series Data from RAWG
            const RAWG_API_KEY = import.meta.env.VITE_RAWG_API_KEY;
            let franchiseData: { id: number; name: string; slug: string; released: string; background_image: string }[] = [];
            
            try {
                if (rawgId && RAWG_API_KEY) {
                    const { data: seriesData } = await axios.get(`https://api.rawg.io/api/games/${rawgId}/game-series`, {
                        params: { key: RAWG_API_KEY, page_size: 20 }
                    });
                    if (seriesData && seriesData.results) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        franchiseData = seriesData.results.map((g: any) => ({
                            id: g.id,
                            name: g.name,
                            slug: g.slug,
                            released: g.released,
                            background_image: g.background_image
                        }));
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch series data:', err);
                // Continue adding game even if series fetch fails
            }

            const payload = {
                user_id: user.id,
                rawg_id: rawgId,
                title: game.title,
                cover_url: game.cover_url,
                status: 'backlog', // Default status
                rating: game.rating,
                release_date: game.release_date,
                genres: game.genres,
                platform: game.platform,
                hours_played: game.hours_played,
                franchise_data: franchiseData
            };
            
            const { data, error } = await supabase
                .from(TABLE_NAME)
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['games-library'] });
        },
    });

    // UPDATE STATUS
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: GameStatus }) => {
            if (!user) throw new Error('User not logged in');

            const { error } = await supabase
                .from(TABLE_NAME)
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['games-library'] });
        },
    });

    // REMOVE GAME
    const removeGameMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!user) throw new Error('User not logged in');

            const { error } = await supabase
                .from(TABLE_NAME)
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['games-library'] });
        },
    });

    // UPDATE PLATFORM
    const updatePlatformMutation = useMutation({
        mutationFn: async ({ id, platforms }: { id: string; platforms: string[] }) => {
            if (!user) throw new Error('User not logged in');

            const { error } = await supabase
                .from(TABLE_NAME)
                .update({ platform: platforms, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['games-library'] });
        },
    });

    const isInLibrary = (rawgId: number) => {
        return libraryGames.some(g => g.rawg_id === rawgId);
    };

    return {
        libraryGames,
        isLoading,
        addGame: addGameMutation.mutate,
        updateStatus: updateStatusMutation.mutate,
        updatePlatform: updatePlatformMutation.mutate,
        removeGame: removeGameMutation.mutate,
        isInLibrary,
        isAdding: addGameMutation.isPending
    };
};
