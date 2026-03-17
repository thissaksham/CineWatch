import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Clapperboard, MonitorPlay, Menu, X, Plus, Lock, Trash2, RotateCw } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useWatchlist } from '../../watchlist/context/WatchlistContext';
import { SearchModal } from '../../search/components/SearchModal';
import { MovieModal } from '../../movies/components/MovieModal';
import { ShowModal } from '../../shows/components/ShowModal';
import { ChangePasswordModal } from '../../auth/components/ChangePasswordModal';
import { SyncOverlay } from '../../../shared/components/ui/SyncOverlay';
import type { TMDBMedia } from '../../../lib/tmdb';

export const Header = () => {
    const { signOut, deleteAccount, user } = useAuth();
    const { refreshAllMetadata, loading } = useWatchlist();
    const navigate = useNavigate();
    const location = useLocation();

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isAddOpen, setIsAddOpen] = useState(false);

    const getSearchType = (path: string) => {
        if (path.startsWith('/movies')) return 'movie';
        if (path.startsWith('/shows')) return 'tv';
        return 'multi';
    };

    const initialSearchType = getSearchType(location.pathname);

    const [recentlyAddedMedia, setRecentlyAddedMedia] = useState<TMDBMedia | null>(null);

    // Dropdown State
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        navigate('/auth');
    };

    const handleDeleteAccount = async () => {
        const confirmed = window.confirm(
            'Are you sure you want to delete your account? \n\nThis will permanently delete your entire watchlist. This action cannot be undone.'
        );

        if (confirmed) {
            try {
                await deleteAccount();
                navigate('/auth');
            } catch {
                alert('Failed to delete account data. Please try again.');
            }
        }
    };

    const navItems = [
        { name: 'Movies', path: '/movies', icon: Clapperboard },
        { name: 'Shows', path: '/shows', icon: MonitorPlay },
    ];

    return (
        <>
            {/* Top Navbar */}
            <header className="navbar">
                {/* Left: Logo & Nav */}
                <div className="flex-center">
                    <NavLink to="/" className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                        <Clapperboard size={24} strokeWidth={2.5} color="var(--primary)" />
                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>CineTrack</span>
                    </NavLink>

                    <nav className="nav-links" style={{ display: 'none', marginLeft: '1rem' }}>
                        {navItems.map((item) => (
                            <NavLink
                                key={item.name}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            >
                                {item.name}
                            </NavLink>
                        ))}
                    </nav>
                    {/* Quick hack for desktop nav visibility since I removed Tailwind */}
                    <style>{`
                        @media (min-width: 768px) {
                            .nav-links { display: flex !important; }
                            .mobile-toggle { display: none !important; }
                        }
                        @media (max-width: 767px) {
                            .nav-links { display: none; }
                        }
                    `}</style>
                </div>

                {/* Right: Add Button & Profile */}
                <div className="flex-center" style={{ gap: '0.5rem' }}>
                    {/* Global Add Button (Elongated) */}
                    <button
                        className="navbar-add-btn"
                        onClick={() => setIsAddOpen(true)}
                        title="Add Movie or Show"
                        style={{ marginRight: 0 }}
                    >
                        <Plus size={18} />
                        <span>Add Something new</span>
                    </button>

                    {/* User Dropdown */}
                    <div className="relative" ref={menuRef}>
                        <button
                            className="profile-pill hover:bg-white/10 transition-colors"
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="avatar">
                                {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium hidden lg:block text-gray-300 max-w-[100px] truncate">
                                {user?.email?.split('@')[0]}
                            </span>
                        </button>

                        {/* Dropdown Menu */}
                        {isUserMenuOpen && (
                            <div className="user-dropdown-menu">
                                <div className="dropdown-section">
                                    <p className="dropdown-label">Account</p>
                                    <p className="dropdown-value" title={user?.email}>{user?.email}</p>
                                </div>

                                <button
                                    onClick={async () => {
                                        setIsUserMenuOpen(false);
                                        if (confirm("Refresh all metadata? This may take a moment.")) {
                                            setIsSyncing(true);
                                            try {
                                                await refreshAllMetadata();
                                            } finally {
                                                setIsSyncing(false);
                                            }
                                        }
                                    }}
                                    className="dropdown-btn"
                                    disabled={loading || isSyncing}
                                >
                                    <RotateCw size={16} className={loading || isSyncing ? "animate-spin" : ""} />
                                    {loading || isSyncing ? 'Syncing...' : 'Sync Library'}
                                </button>

                                <button
                                    onClick={() => { setIsUserMenuOpen(false); setShowPasswordModal(true); }}
                                    className="dropdown-btn"
                                >
                                    <Lock size={16} /> Change Password
                                </button>

                                <div className="dropdown-divider"></div>

                                <button
                                    onClick={handleSignOut}
                                    className="dropdown-btn"
                                    style={{ color: '#9ca3af' }}
                                >
                                    <LogOut size={16} /> Sign Out
                                </button>

                                <div className="dropdown-divider"></div>

                                <button
                                    onClick={handleDeleteAccount}
                                    className="dropdown-btn danger"
                                >
                                    <Trash2 size={16} /> Delete Account
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="mobile-toggle"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </header>

            {/* Mobile Nav Menu */}
            {mobileMenuOpen && (
                <div className="mobile-menu-overlay">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', width: '100%' }}
                        >
                            <item.icon size={18} />
                            {item.name}
                        </NavLink>
                    ))}
                </div>
            )}

            <SearchModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                type={initialSearchType}
                onSuccess={(media: TMDBMedia) => {
                    // Standard Media Logic
                    const isTV = media.media_type === 'tv' || !!media.first_air_date;
                    if (isTV) {
                        setRecentlyAddedMedia(media);
                    }
                }}
            />

            {recentlyAddedMedia && (
                (recentlyAddedMedia.media_type === 'tv' || !!recentlyAddedMedia.first_air_date) ? (
                    <ShowModal
                        media={recentlyAddedMedia}
                        onClose={() => setRecentlyAddedMedia(null)}
                    />
                ) : (
                    <MovieModal
                        media={recentlyAddedMedia}
                        onClose={() => setRecentlyAddedMedia(null)}
                    />
                )
            )}

            {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

            {/* Sync Overlay */}
            {isSyncing && <SyncOverlay />}
        </>
    );
};
