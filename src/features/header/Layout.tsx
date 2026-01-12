import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './components/Header';

export const Layout = () => {
    // Sync default title
    useEffect(() => {
        document.title = 'CineTrack | Your Personal Watchlist';
    }, []);

    return (
        <div className="app-container">
            <Header />

            {/* Main Content */}
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
