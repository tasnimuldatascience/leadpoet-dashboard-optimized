"use strict";
// Simple in-memory cache with stale-while-revalidate
// Returns stale data immediately while refreshing in background
// Uses global to persist across Next.js module reloads
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleCache = void 0;
// Use global to persist cache in development
var globalForCache = globalThis;
if (!globalForCache.dashboardCache) {
    globalForCache.dashboardCache = {
        entries: new Map(),
        refreshing: new Set(),
    };
}
var cache = globalForCache.dashboardCache;
var TTL = 5 * 60 * 1000; // 5 minutes - after this, data is "stale" but still usable
var MAX_STALE = 60 * 60 * 1000; // 1 hour - after this, data is too old to use
exports.simpleCache = {
    // Get fresh data only (not expired)
    get: function (key, hours) {
        var entry = cache.entries.get("".concat(key, "_").concat(hours));
        if (!entry)
            return null;
        var age = Date.now() - entry.timestamp;
        if (age > TTL) {
            return null; // Expired, need fresh data
        }
        console.log("[Cache] HIT for ".concat(key, " (hours=").concat(hours, ")"));
        return entry.data;
    },
    // Get data even if stale (for stale-while-revalidate)
    getStale: function (key, hours) {
        var entry = cache.entries.get("".concat(key, "_").concat(hours));
        if (!entry)
            return null;
        var age = Date.now() - entry.timestamp;
        // Too old to use at all
        if (age > MAX_STALE) {
            cache.entries.delete("".concat(key, "_").concat(hours));
            return null;
        }
        var isStale = age > TTL;
        if (isStale) {
            console.log("[Cache] STALE HIT for ".concat(key, " (hours=").concat(hours, ") - age: ").concat(Math.round(age / 1000), "s"));
        }
        else {
            console.log("[Cache] HIT for ".concat(key, " (hours=").concat(hours, ")"));
        }
        return { data: entry.data, isStale: isStale };
    },
    // Check if a refresh is already in progress
    isRefreshing: function (key, hours) {
        return cache.refreshing.has("".concat(key, "_").concat(hours));
    },
    // Mark as refreshing
    setRefreshing: function (key, hours, value) {
        var cacheKey = "".concat(key, "_").concat(hours);
        if (value) {
            cache.refreshing.add(cacheKey);
        }
        else {
            cache.refreshing.delete(cacheKey);
        }
    },
    set: function (key, data, hours) {
        cache.entries.set("".concat(key, "_").concat(hours), {
            data: data,
            timestamp: Date.now(),
            hours: hours,
        });
        // Clear refreshing flag
        cache.refreshing.delete("".concat(key, "_").concat(hours));
        // Log cache size
        var jsonStr = JSON.stringify(data);
        var sizeBytes = Buffer.byteLength(jsonStr, 'utf8');
        var sizeKB = (sizeBytes / 1024).toFixed(2);
        console.log("[Cache] SET ".concat(key, " (hours=").concat(hours, ") - Size: ").concat(sizeKB, " KB"));
    },
    clear: function () {
        cache.entries.clear();
        cache.refreshing.clear();
    },
};
