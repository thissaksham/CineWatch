import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { removeLocalStorageItem, clearSupabaseStorage } from '../../../utils/localStorage';


interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    changePassword: (password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const initAuth = async () => {
            try {
                if (!supabase) throw new Error("Supabase client is not initialized");

                // Strict check: getUser() verifies with Supabase server that user still exists
                // whereas getSession() only reads the local token.
                const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

                if (userError || !currentUser) {
                    // If server says user is gone, clear local session
                    console.warn("User validation failed (deleted or invalid), clearing session.");

                    // Force sign out to clear Supabase client state
                    await supabase.auth.signOut();

                    // Safely clear Supabase tokens from localStorage
                    clearSupabaseStorage();

                    setSession(null);
                    setUser(null);
                } else {
                    const { data: { session: activeSession } } = await supabase.auth.getSession();
                    setSession(activeSession);
                    setUser(currentUser);
                }


            } catch (err: unknown) {
                console.error("Auth Init Error:", err);
                setError(err instanceof Error ? err.message : "Unknown Auth Error");
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);



            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    const deleteAccount = async () => {
        if (!user) return;

        // Call the SQL function we created to delete the AUTH record
        // The 'ON DELETE CASCADE' we set up in SQL handles wiping the watchlist automatically
        const { error: deleteError } = await supabase.rpc('delete_user');

        if (deleteError) {
            console.error('Error in self-deletion:', deleteError);
            throw new Error('Failed to delete account. Ensure the SQL function exists.');
        }

        // 2. Clear local storage safely
        removeLocalStorageItem('tmdb_region');
        removeLocalStorageItem('watchlist');

        // 3. Clear Supabase local storage tokens safely
        // We don't call signOut() because the user record is already gone from the server (causes 403)
        clearSupabaseStorage();

        // 4. Reset local state
        setSession(null);
        setUser(null);
    };

    const changePassword = async (password: string) => {
        return await supabase.auth.updateUser({ password });
    };

    const value = useMemo(() => ({
        user,
        session,
        loading,
        signOut,
        deleteAccount,
        changePassword,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [user, session, loading]);

    if (error) {
        return <div style={{ color: 'red', padding: 20, border: '1px solid red' }}>
            <h3>Auth Context Error:</h3>
            <pre>{error}</pre>
        </div>;
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
