/**
 * Simple File-Based Rate Limiter
 * Uses a JSON file to persist rate limit data across serverless cold starts
 * More reliable than in-memory Map which resets on every cold start
 */

import fs from 'fs';
import path from 'path';

// Store rate limit data in /tmp (available in Vercel)
const RATE_LIMIT_FILE = path.join('/tmp', 'rate-limits.json');
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per IP

function loadRateLimits() {
    try {
        if (fs.existsSync(RATE_LIMIT_FILE)) {
            const data = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[RateLimit] Failed to load:', e);
    }
    return {};
}

function saveRateLimits(limits) {
    try {
        fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(limits), 'utf8');
    } catch (e) {
        console.error('[RateLimit] Failed to save:', e);
    }
}

function getRateLimitKey(request) {
    return request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        request.headers['x-real-ip'] ||
        'unknown';
}

function isRateLimited(request) {
    const key = getRateLimitKey(request);
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Load existing limits
    const rateLimits = loadRateLimits();

    if (!rateLimits[key]) {
        rateLimits[key] = [];
    }

    // Clean old entries (sliding window)
    const validRequests = rateLimits[key].filter(timestamp => timestamp > windowStart);

    if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return true; // Rate limited!
    }

    // Add current request
    validRequests.push(now);
    rateLimits[key] = validRequests;

    // Save updated limits
    saveRateLimits(rateLimits);

    return false;
}

export {
    isRateLimited,
    getRateLimitKey
};
