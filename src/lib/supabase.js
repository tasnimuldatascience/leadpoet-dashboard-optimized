"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.fetchConsensusResults = fetchConsensusResults;
exports.fetchSubmissions = fetchSubmissions;
exports.fetchAllConsensusForEpochStats = fetchAllConsensusForEpochStats;
exports.fetchLeadJourney = fetchLeadJourney;
var supabase_js_1 = require("@supabase/supabase-js");
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
// Helper to add delay between batches
var delay = function (ms) { return new Promise(function (r) { return setTimeout(r, ms); }); };
// Fields needed for consensus results (for matching with submissions)
var CONSENSUS_SELECT = 'id,ts,email_hash,payload';
// Fields needed for submissions
var SUBMISSION_SELECT = 'id,ts,actor_hotkey,email_hash,tee_sequence,payload';
// Fetch with retry logic and delays to avoid overwhelming Supabase
// Returns { data, failed } to distinguish between empty result and failure
function fetchWithRetry(queryFn_1) {
    return __awaiter(this, arguments, void 0, function (queryFn, maxRetries, retryDelay) {
        var attempt, _a, data, error;
        if (maxRetries === void 0) { maxRetries = 3; }
        if (retryDelay === void 0) { retryDelay = 2000; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    attempt = 0;
                    _b.label = 1;
                case 1:
                    if (!(attempt < maxRetries)) return [3 /*break*/, 6];
                    return [4 /*yield*/, queryFn()];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (!error) {
                        return [2 /*return*/, { data: data || [], failed: false }];
                    }
                    if (!(error.code === '57014' && attempt < maxRetries - 1)) return [3 /*break*/, 4];
                    console.log("Timeout, retrying (attempt ".concat(attempt + 2, "/").concat(maxRetries, ")..."));
                    return [4 /*yield*/, delay(retryDelay * (attempt + 1))]; // Exponential backoff
                case 3:
                    _b.sent(); // Exponential backoff
                    return [3 /*break*/, 5];
                case 4:
                    console.error('Query error:', error);
                    return [2 /*return*/, { data: [], failed: true }];
                case 5:
                    attempt++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, { data: [], failed: true }];
            }
        });
    });
}
// Fetch consensus results (no timestamp filter - filtered by UID in metagraph later)
function fetchConsensusResults() {
    return __awaiter(this, arguments, void 0, function (_hoursFilter) {
        var allData, offset, batchSize, consecutiveFailures, maxConsecutiveFailures, result;
        if (_hoursFilter === void 0) { _hoursFilter = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allData = [];
                    offset = 0;
                    batchSize = 1000;
                    consecutiveFailures = 0;
                    maxConsecutiveFailures = 3;
                    _a.label = 1;
                case 1:
                    if (!(consecutiveFailures < maxConsecutiveFailures)) return [3 /*break*/, 5];
                    return [4 /*yield*/, fetchWithRetry(function () {
                            return exports.supabase
                                .from('transparency_log')
                                .select(CONSENSUS_SELECT)
                                .eq('event_type', 'CONSENSUS_RESULT')
                                .order('ts', { ascending: false })
                                .range(offset, offset + batchSize - 1);
                        })];
                case 2:
                    result = _a.sent();
                    if (result.failed) {
                        consecutiveFailures++;
                        console.log("[Supabase] Batch at offset ".concat(offset, " failed, skipping (").concat(consecutiveFailures, "/").concat(maxConsecutiveFailures, " consecutive failures)"));
                        offset += batchSize;
                        return [3 /*break*/, 1];
                    }
                    consecutiveFailures = 0; // Reset on success
                    if (result.data.length === 0)
                        return [3 /*break*/, 5];
                    allData.push.apply(allData, result.data);
                    if (result.data.length < batchSize)
                        return [3 /*break*/, 5];
                    offset += batchSize;
                    if (!(offset % 10000 === 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, delay(100)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 1];
                case 5:
                    console.log("[Supabase] Fetched ".concat(allData.length, " CONSENSUS_RESULT events"));
                    return [2 /*return*/, allData];
            }
        });
    });
}
// Fetch submissions (no timestamp filter - filtered by UID in metagraph later)
function fetchSubmissions() {
    return __awaiter(this, arguments, void 0, function (_hoursFilter) {
        var allData, offset, batchSize, consecutiveFailures, maxConsecutiveFailures, result;
        if (_hoursFilter === void 0) { _hoursFilter = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allData = [];
                    offset = 0;
                    batchSize = 1000;
                    consecutiveFailures = 0;
                    maxConsecutiveFailures = 3;
                    _a.label = 1;
                case 1:
                    if (!(consecutiveFailures < maxConsecutiveFailures)) return [3 /*break*/, 5];
                    return [4 /*yield*/, fetchWithRetry(function () {
                            return exports.supabase
                                .from('transparency_log')
                                .select(SUBMISSION_SELECT)
                                .eq('event_type', 'SUBMISSION')
                                .order('ts', { ascending: false })
                                .range(offset, offset + batchSize - 1);
                        })];
                case 2:
                    result = _a.sent();
                    if (result.failed) {
                        consecutiveFailures++;
                        console.log("[Supabase] Batch at offset ".concat(offset, " failed, skipping (").concat(consecutiveFailures, "/").concat(maxConsecutiveFailures, " consecutive failures)"));
                        offset += batchSize;
                        return [3 /*break*/, 1];
                    }
                    consecutiveFailures = 0; // Reset on success
                    if (result.data.length === 0)
                        return [3 /*break*/, 5];
                    allData.push.apply(allData, result.data);
                    if (result.data.length < batchSize)
                        return [3 /*break*/, 5];
                    offset += batchSize;
                    if (!(offset % 10000 === 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, delay(100)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 1];
                case 5:
                    console.log("[Supabase] Fetched ".concat(allData.length, " SUBMISSION events"));
                    return [2 /*return*/, allData];
            }
        });
    });
}
// Fetch all consensus results for epoch stats (directly from CONSENSUS_RESULT events)
function fetchAllConsensusForEpochStats() {
    return __awaiter(this, void 0, void 0, function () {
        var allData, offset, batchSize, consecutiveFailures, maxConsecutiveFailures, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    allData = [];
                    offset = 0;
                    batchSize = 1000;
                    consecutiveFailures = 0;
                    maxConsecutiveFailures = 3;
                    _a.label = 1;
                case 1:
                    if (!(consecutiveFailures < maxConsecutiveFailures)) return [3 /*break*/, 5];
                    return [4 /*yield*/, fetchWithRetry(function () {
                            return exports.supabase
                                .from('transparency_log')
                                .select(CONSENSUS_SELECT)
                                .eq('event_type', 'CONSENSUS_RESULT')
                                .order('ts', { ascending: false })
                                .range(offset, offset + batchSize - 1);
                        })];
                case 2:
                    result = _a.sent();
                    if (result.failed) {
                        consecutiveFailures++;
                        console.log("[Supabase] EpochStats batch at offset ".concat(offset, " failed, skipping (").concat(consecutiveFailures, "/").concat(maxConsecutiveFailures, " consecutive failures)"));
                        offset += batchSize;
                        return [3 /*break*/, 1];
                    }
                    consecutiveFailures = 0; // Reset on success
                    if (result.data.length === 0)
                        return [3 /*break*/, 5];
                    allData.push.apply(allData, result.data);
                    if (result.data.length < batchSize)
                        return [3 /*break*/, 5];
                    offset += batchSize;
                    if (!(offset % 10000 === 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, delay(100)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 1];
                case 5: return [2 /*return*/, allData];
            }
        });
    });
}
// Fetch lead journey by email hash
function fetchLeadJourney(emailHash) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, exports.supabase
                        .from('transparency_log')
                        .select('*')
                        .eq('email_hash', emailHash)
                        .order('ts', { ascending: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error('Error fetching lead journey:', error);
                        return [2 /*return*/, []];
                    }
                    return [2 /*return*/, data || []];
            }
        });
    });
}
