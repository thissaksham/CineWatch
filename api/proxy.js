/**
 * TMDB API Proxy
 * Securely proxies requests to TMDB API with authentication and rate limiting.
 */

// Use file-based rate limiter (persists across cold starts)
import { isRateLimited, getRateLimitKey } from './rateLimit.js';


function isValidOrigin(request) {
    const origin = request.headers.origin || request.headers.referer || '';
    const host = request.headers.host || '';

    // Allow requests from same origin (Vercel deployment)
    if (origin.includes(host.split(':')[0])) {
        return true;
    }

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return true;
    }

    // Allow Vercel preview deployments
    if (origin.includes('.vercel.app')) {
        return true;
    }

    // Allow requests with no origin (same-origin requests, curl, etc.)
    if (!origin) {
        return true;
    }

    return false;
}

function isValidPath(path) {
    if (!path || typeof path !== 'string') {
        return false;
    }

    // Only allow alphanumeric, slashes, hyphens, and underscores
    // This prevents path traversal and injection attacks
    const validPathRegex = /^[a-zA-Z0-9\/_-]+$/;
    if (!validPathRegex.test(path)) {
        return false;
    }

    // Prevent path traversal
    if (path.includes('..')) {
        return false;
    }

    // Maximum path length
    if (path.length > 200) {
        return false;
    }

    return true;
}

export default async function handler(request, response) {
    // 1. CORS headers for browser requests
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin || '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Origin validation
    if (!isValidOrigin(request)) {
        console.warn('[Proxy] Blocked request from invalid origin:', request.headers.origin);
        return response.status(403).json({ error: 'Forbidden' });
    }

    // 3. Rate limiting (file-based, persists across cold starts)
    if (isRateLimited(request)) {
        console.warn('[Proxy] Rate limit exceeded for:', getRateLimitKey(request));
        return response.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    // 4. Validate API key presence
    const apiKey = process.env.VITE_TMDB_API_KEY;
    if (!apiKey) {
        console.error('[Proxy] Missing TMDB API key');
        return response.status(500).json({ error: 'Server configuration error' });
    }

    // 5. Validate and sanitize path
    const { path } = request.query;
    if (!isValidPath(path)) {
        return response.status(400).json({ error: 'Invalid path parameter' });
    }

    // 6. Construct target URL with sanitized parameters
    const queryParams = new URLSearchParams();

    // Whitelist allowed query parameters
    const allowedParams = ['region', 'query', 'page', 'append_to_response', 'language'];
    for (const [key, value] of Object.entries(request.query)) {
        if (key !== 'path' && allowedParams.includes(key) && typeof value === 'string') {
            // Sanitize values - remove any control characters
            const sanitizedValue = value.replace(/[\x00-\x1f\x7f]/g, '');
            queryParams.append(key, sanitizedValue);
        }
    }
    queryParams.append('api_key', apiKey);

    const targetUrl = `https://api.themoviedb.org/3/${path}?${queryParams.toString()}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
            }
        });

        clearTimeout(timeoutId);

        const data = await res.json();

        // Don't expose detailed error messages from upstream
        if (!res.ok) {
            console.error('[Proxy] TMDB error:', res.status, data.status_message);
            return response.status(res.status).json({
                error: 'Upstream API error',
                status_code: res.status
            });
        }

        return response.status(200).json(data);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('[Proxy] Request timeout');
            return response.status(504).json({ error: 'Request timeout' });
        }
        console.error('[Proxy] Error:', error.message);
        return response.status(500).json({ error: 'Proxy request failed' });
    }
}
