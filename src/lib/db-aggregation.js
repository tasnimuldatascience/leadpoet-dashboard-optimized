"use strict";
// Database aggregation queries - fetch once, aggregate all stats
// Time filtering done at DB level, filter by active miners (metagraph)
// Results cached for 5 minutes (~100KB, not raw data)
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
exports.fetchAllDashboardData = fetchAllDashboardData;
var supabase_1 = require("./supabase");
var simple_cache_1 = require("./simple-cache");
// Normalize decision values
function normalizeDecision(decision) {
    if (!decision)
        return 'PENDING';
    var lower = decision.toLowerCase();
    if (['deny', 'denied', 'reject', 'rejected'].includes(lower))
        return 'REJECTED';
    if (['allow', 'allowed', 'accept', 'accepted', 'approve', 'approved'].includes(lower))
        return 'ACCEPTED';
    return 'PENDING';
}
// Get ISO timestamp for hours ago (0 = no filter / all time)
function getTimeCutoff(hours) {
    if (hours <= 0)
        return null;
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
// Clean up rejection reason
function cleanRejectionReason(reason) {
    if (!reason || reason === 'N/A')
        return 'N/A';
    try {
        if (reason.startsWith('{')) {
            var parsed = JSON.parse(reason);
            var failedFields = parsed.failed_fields || [];
            if (failedFields.length > 0) {
                var fieldMap = {
                    email: 'Invalid Email', website: 'Invalid Website', site: 'Invalid Website',
                    source_url: 'Invalid Source URL', linkedin: 'Invalid LinkedIn', region: 'Invalid Region',
                    role: 'Invalid Role', industry: 'Invalid Industry', phone: 'Invalid Phone',
                    name: 'Invalid Name', first_name: 'Invalid Name', last_name: 'Invalid Name',
                    company: 'Invalid Company', title: 'Invalid Title', address: 'Invalid Address',
                    exception: 'Validation Error', llm_error: 'LLM Error', source_type: 'Invalid Source Type',
                };
                for (var _i = 0, failedFields_1 = failedFields; _i < failedFields_1.length; _i++) {
                    var field = failedFields_1[_i];
                    var mapped = fieldMap[field.toLowerCase()];
                    if (mapped)
                        return mapped;
                }
                return "Invalid ".concat(failedFields[0].replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
            }
            var checkName = parsed.check_name || '';
            var message = parsed.message || '';
            var checkNameMap = {
                check_truelist_email: 'Invalid Email', check_myemailverifier_email: 'Invalid Email',
                check_email_regex: 'Invalid Email', check_mx_record: 'Invalid Email',
                check_linkedin_gse: 'Invalid LinkedIn', check_head_request: 'Invalid Website',
                check_source_provenance: 'Invalid Source URL', check_domain_age: 'Invalid Website',
                check_dnsbl: 'Invalid Website', check_name_email_match: 'Name/Email Mismatch',
                check_free_email_domain: 'Free Email Domain', validation_error: 'Validation Error',
                deep_verification: 'Deep Verification Failed',
            };
            if (checkName === 'check_stage5_unified') {
                var msgLower = message.toLowerCase();
                if (msgLower.includes('region') && msgLower.includes('failed'))
                    return 'Invalid Region';
                if (msgLower.includes('role') && msgLower.includes('failed'))
                    return 'Invalid Role';
                if (msgLower.includes('industry') && msgLower.includes('failed'))
                    return 'Invalid Industry';
                return 'Role/Region/Industry Failed';
            }
            if (checkNameMap[checkName])
                return checkNameMap[checkName];
            var stage = parsed.stage || '';
            if (stage.includes('Email') || stage.includes('TrueList'))
                return 'Invalid Email';
            if (stage.includes('LinkedIn') || stage.includes('GSE'))
                return 'Invalid LinkedIn';
            if (stage.includes('DNS') || stage.includes('Domain'))
                return 'Invalid Website';
            if (stage.includes('Source Provenance'))
                return 'Invalid Source URL';
            if (parsed.failed_field) {
                var fm = {
                    site: 'Invalid Website', website: 'Invalid Website', email: 'Invalid Email',
                    phone: 'Invalid Phone', name: 'Invalid Name', company: 'Invalid Company',
                    title: 'Invalid Title', linkedin: 'Invalid LinkedIn', address: 'Invalid Address',
                };
                return fm[parsed.failed_field.toLowerCase()] || "Invalid ".concat(parsed.failed_field);
            }
            if (parsed.reason)
                return parsed.reason.substring(0, 50);
            if (parsed.error)
                return parsed.error.substring(0, 50);
        }
    }
    catch ( /* Not JSON */_a) { /* Not JSON */ }
    var reasonLower = reason.toLowerCase();
    if (reasonLower.includes('duplicate'))
        return 'Duplicate Lead';
    if (reasonLower.includes('spam'))
        return 'Spam Detected';
    if (reasonLower.includes('disposable'))
        return 'Disposable Email';
    if (reasonLower.includes('catchall') || reasonLower.includes('catch-all'))
        return 'Catch-all Email';
    if (reasonLower.includes('bounced') || reasonLower.includes('bounce'))
        return 'Email Bounced';
    var clean = reason.replace(/[{}\[\]"':]/g, '').replace(/\s+/g, ' ').trim();
    return clean.length > 40 ? clean.substring(0, 40) + '...' : clean;
}
// Fetch and merge submissions with consensus - SINGLE fetch, used by all aggregations
function fetchMergedLeads(hours, metagraph) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, cutoff, activeMiners, allSubmissions, offset, batchSize, query, _a, data, error, filteredSubmissions, consensusMap, query, _b, data, error, _i, data_1, row, p, seenEmailHashes, merged, _c, filteredSubmissions_1, sub, cons, fetchTime;
        var _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    console.log("[DB] Fetching merged leads (hours=".concat(hours, ")..."));
                    startTime = Date.now();
                    cutoff = getTimeCutoff(hours);
                    activeMiners = metagraph ? new Set(Object.keys(metagraph.hotkeyToUid)) : null;
                    allSubmissions = [];
                    offset = 0;
                    batchSize = 1000;
                    _f.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 3];
                    query = supabase_1.supabase
                        .from('transparency_log')
                        .select('ts,actor_hotkey,email_hash')
                        .eq('event_type', 'SUBMISSION')
                        .not('actor_hotkey', 'is', null)
                        .not('email_hash', 'is', null);
                    if (cutoff)
                        query = query.gte('ts', cutoff);
                    return [4 /*yield*/, query.range(offset, offset + batchSize - 1)];
                case 2:
                    _a = _f.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error('[DB] Error fetching submissions:', error);
                        return [3 /*break*/, 3];
                    }
                    if (!data || data.length === 0)
                        return [3 /*break*/, 3];
                    allSubmissions.push.apply(allSubmissions, data);
                    if (data.length < batchSize)
                        return [3 /*break*/, 3];
                    offset += batchSize;
                    return [3 /*break*/, 1];
                case 3:
                    console.log("[DB] Fetched ".concat(allSubmissions.length, " submissions"));
                    filteredSubmissions = activeMiners
                        ? allSubmissions.filter(function (s) { return activeMiners.has(s.actor_hotkey); })
                        : allSubmissions;
                    console.log("[DB] Filtered to ".concat(filteredSubmissions.length, " submissions from active miners"));
                    consensusMap = new Map();
                    offset = 0;
                    _f.label = 4;
                case 4:
                    if (!true) return [3 /*break*/, 6];
                    query = supabase_1.supabase
                        .from('transparency_log')
                        .select('email_hash,payload')
                        .eq('event_type', 'CONSENSUS_RESULT')
                        .not('email_hash', 'is', null);
                    if (cutoff)
                        query = query.gte('ts', cutoff);
                    return [4 /*yield*/, query.range(offset, offset + batchSize - 1)];
                case 5:
                    _b = _f.sent(), data = _b.data, error = _b.error;
                    if (error) {
                        console.error('[DB] Error fetching consensus:', error);
                        return [3 /*break*/, 6];
                    }
                    if (!data || data.length === 0)
                        return [3 /*break*/, 6];
                    for (_i = 0, data_1 = data; _i < data_1.length; _i++) {
                        row = data_1[_i];
                        if (!row.email_hash || consensusMap.has(row.email_hash))
                            continue;
                        p = row.payload;
                        consensusMap.set(row.email_hash, {
                            decision: (p === null || p === void 0 ? void 0 : p.final_decision) || '',
                            epoch_id: p === null || p === void 0 ? void 0 : p.epoch_id,
                            rep_score: p === null || p === void 0 ? void 0 : p.final_rep_score,
                            rejection_reason: p === null || p === void 0 ? void 0 : p.primary_rejection_reason,
                        });
                    }
                    if (data.length < batchSize)
                        return [3 /*break*/, 6];
                    offset += batchSize;
                    return [3 /*break*/, 4];
                case 6:
                    console.log("[DB] Fetched ".concat(consensusMap.size, " unique consensus results"));
                    seenEmailHashes = new Set();
                    merged = [];
                    for (_c = 0, filteredSubmissions_1 = filteredSubmissions; _c < filteredSubmissions_1.length; _c++) {
                        sub = filteredSubmissions_1[_c];
                        if (seenEmailHashes.has(sub.email_hash))
                            continue;
                        seenEmailHashes.add(sub.email_hash);
                        cons = consensusMap.get(sub.email_hash);
                        merged.push({
                            timestamp: sub.ts,
                            minerHotkey: sub.actor_hotkey,
                            emailHash: sub.email_hash,
                            epochId: (_d = cons === null || cons === void 0 ? void 0 : cons.epoch_id) !== null && _d !== void 0 ? _d : null,
                            decision: cons ? normalizeDecision(cons.decision) : 'PENDING',
                            repScore: (_e = cons === null || cons === void 0 ? void 0 : cons.rep_score) !== null && _e !== void 0 ? _e : null,
                            rejectionReason: cleanRejectionReason(cons === null || cons === void 0 ? void 0 : cons.rejection_reason),
                        });
                    }
                    fetchTime = Date.now() - startTime;
                    console.log("[DB] Merged ".concat(merged.length, " leads in ").concat(fetchTime, "ms"));
                    return [2 /*return*/, merged];
            }
        });
    });
}
// All valid time presets
var ALL_HOUR_PRESETS = [0, 1, 6, 12, 24, 48, 72, 168];
// Track if cache warming is in progress
var isWarmingCache = false;
function fetchAllDashboardData(hours, metagraph) {
    return __awaiter(this, void 0, void 0, function () {
        var staleResult, startTime, leads, summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData, result, totalTime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    staleResult = simple_cache_1.simpleCache.getStale('dashboard', hours);
                    if (staleResult) {
                        if (!staleResult.isStale) {
                            // Fresh data - return immediately
                            return [2 /*return*/, staleResult.data];
                        }
                        // Data is stale - return it immediately but refresh in background
                        if (!simple_cache_1.simpleCache.isRefreshing('dashboard', hours)) {
                            console.log("[Cache] Returning stale data for hours=".concat(hours, ", refreshing in background..."));
                            refreshDataInBackground(hours, metagraph);
                        }
                        return [2 /*return*/, staleResult.data];
                    }
                    // No cached data - must fetch fresh
                    console.log("[DB] Fetching all dashboard data (hours=".concat(hours, ")..."));
                    startTime = Date.now();
                    return [4 /*yield*/, fetchMergedLeads(hours, metagraph)
                        // Calculate all aggregations from the same data
                    ];
                case 1:
                    leads = _a.sent();
                    summary = calculateSummary(leads);
                    minerStats = calculateMinerStats(leads);
                    epochStats = calculateEpochStats(leads);
                    leadInventory = calculateLeadInventory(leads);
                    rejectionReasons = calculateRejectionReasons(leads);
                    incentiveData = calculateIncentiveData(leads);
                    result = { summary: summary, minerStats: minerStats, epochStats: epochStats, leadInventory: leadInventory, rejectionReasons: rejectionReasons, incentiveData: incentiveData };
                    // Cache the aggregated results
                    simple_cache_1.simpleCache.set('dashboard', result, hours);
                    totalTime = Date.now() - startTime;
                    console.log("[DB] All dashboard data calculated in ".concat(totalTime, "ms"));
                    // Trigger background cache warming for other presets (only once)
                    if (!isWarmingCache) {
                        warmCacheInBackground(metagraph);
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
// Refresh data in background without blocking the response
function refreshDataInBackground(hours, metagraph) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, leads, summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData, result, totalTime, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    simple_cache_1.simpleCache.setRefreshing('dashboard', hours, true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    console.log("[Cache] Background refresh started for hours=".concat(hours, "..."));
                    startTime = Date.now();
                    return [4 /*yield*/, fetchMergedLeads(hours, metagraph)];
                case 2:
                    leads = _a.sent();
                    summary = calculateSummary(leads);
                    minerStats = calculateMinerStats(leads);
                    epochStats = calculateEpochStats(leads);
                    leadInventory = calculateLeadInventory(leads);
                    rejectionReasons = calculateRejectionReasons(leads);
                    incentiveData = calculateIncentiveData(leads);
                    result = { summary: summary, minerStats: minerStats, epochStats: epochStats, leadInventory: leadInventory, rejectionReasons: rejectionReasons, incentiveData: incentiveData };
                    simple_cache_1.simpleCache.set('dashboard', result, hours);
                    totalTime = Date.now() - startTime;
                    console.log("[Cache] Background refresh completed for hours=".concat(hours, " in ").concat(totalTime, "ms"));
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    console.error("[Cache] Background refresh failed for hours=".concat(hours, ":"), err_1);
                    simple_cache_1.simpleCache.setRefreshing('dashboard', hours, false);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Pre-warm cache for all time presets in background
function warmCacheInBackground(metagraph) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, ALL_HOUR_PRESETS_1, hours, leads, summary, minerStats, epochStats, leadInventory, rejectionReasons, incentiveData, result, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isWarmingCache)
                        return [2 /*return*/];
                    isWarmingCache = true;
                    console.log('[Cache] Starting background cache warming...');
                    _i = 0, ALL_HOUR_PRESETS_1 = ALL_HOUR_PRESETS;
                    _a.label = 1;
                case 1:
                    if (!(_i < ALL_HOUR_PRESETS_1.length)) return [3 /*break*/, 6];
                    hours = ALL_HOUR_PRESETS_1[_i];
                    // Skip if already cached
                    if (simple_cache_1.simpleCache.get('dashboard', hours)) {
                        return [3 /*break*/, 5];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    console.log("[Cache] Warming cache for hours=".concat(hours, "..."));
                    return [4 /*yield*/, fetchMergedLeads(hours, metagraph)];
                case 3:
                    leads = _a.sent();
                    summary = calculateSummary(leads);
                    minerStats = calculateMinerStats(leads);
                    epochStats = calculateEpochStats(leads);
                    leadInventory = calculateLeadInventory(leads);
                    rejectionReasons = calculateRejectionReasons(leads);
                    incentiveData = calculateIncentiveData(leads);
                    result = { summary: summary, minerStats: minerStats, epochStats: epochStats, leadInventory: leadInventory, rejectionReasons: rejectionReasons, incentiveData: incentiveData };
                    simple_cache_1.simpleCache.set('dashboard', result, hours);
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _a.sent();
                    console.error("[Cache] Failed to warm cache for hours=".concat(hours, ":"), err_2);
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    console.log('[Cache] Background cache warming complete!');
                    isWarmingCache = false;
                    return [2 /*return*/];
            }
        });
    });
}
// Aggregation functions (work on already-fetched data)
function calculateSummary(leads) {
    var accepted = leads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
    var rejected = leads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
    var pending = leads.filter(function (l) { return l.decision === 'PENDING'; }).length;
    var total = leads.length;
    var decided = accepted + rejected;
    // Only calculate avg rep score for ACCEPTED leads
    var acceptedLeads = leads.filter(function (l) { return l.decision === 'ACCEPTED'; });
    var repScores = acceptedLeads.filter(function (l) { return l.repScore != null; }).map(function (l) { return l.repScore; });
    var avgRepScore = repScores.length > 0 ? repScores.reduce(function (a, b) { return a + b; }, 0) / repScores.length : 0;
    var miners = new Set(leads.map(function (l) { return l.minerHotkey; }));
    var epochs = new Set(leads.filter(function (l) { return l.epochId != null; }).map(function (l) { return l.epochId; }));
    return {
        total_submissions: total,
        total_accepted: accepted,
        total_rejected: rejected,
        total_pending: pending,
        acceptance_rate: decided > 0 ? (accepted / decided) * 100 : 0,
        avg_rep_score: Math.round(avgRepScore * 10000) / 10000,
        unique_miners: miners.size,
        unique_epochs: epochs.size,
        latest_epoch: epochs.size > 0 ? Math.max.apply(Math, epochs) : 0,
    };
}
function calculateMinerStats(leads) {
    var _a;
    // First, determine epoch IDs for last20 and current epoch calculations
    var epochIds = new Set();
    for (var _i = 0, leads_1 = leads; _i < leads_1.length; _i++) {
        var lead = leads_1[_i];
        if (lead.epochId != null)
            epochIds.add(lead.epochId);
    }
    var sortedEpochs = Array.from(epochIds).sort(function (a, b) { return b - a; });
    var currentEpochId = (_a = sortedEpochs[0]) !== null && _a !== void 0 ? _a : null;
    var last20EpochIds = new Set(sortedEpochs.slice(0, 20));
    // Group leads by miner
    var minerMap = new Map();
    for (var _b = 0, leads_2 = leads; _b < leads_2.length; _b++) {
        var lead = leads_2[_b];
        if (!minerMap.has(lead.minerHotkey))
            minerMap.set(lead.minerHotkey, []);
        minerMap.get(lead.minerHotkey).push(lead);
    }
    return Array.from(minerMap.entries()).map(function (_a) {
        var hotkey = _a[0], minerLeads = _a[1];
        var accepted = minerLeads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
        var rejected = minerLeads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
        var pending = minerLeads.filter(function (l) { return l.decision === 'PENDING'; }).length;
        var decided = accepted + rejected;
        // Only calculate avg rep score for ACCEPTED leads
        var acceptedMinerLeads = minerLeads.filter(function (l) { return l.decision === 'ACCEPTED'; });
        var repScores = acceptedMinerLeads.filter(function (l) { return l.repScore != null; }).map(function (l) { return l.repScore; });
        var avgRepScore = repScores.length > 0 ? repScores.reduce(function (a, b) { return a + b; }, 0) / repScores.length : 0;
        // Last 20 epochs stats
        var last20Leads = minerLeads.filter(function (l) { return l.epochId != null && last20EpochIds.has(l.epochId); });
        var last20Accepted = last20Leads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
        var last20Rejected = last20Leads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
        // Current epoch stats
        var currentLeads = currentEpochId != null
            ? minerLeads.filter(function (l) { return l.epochId === currentEpochId; })
            : [];
        var currentAccepted = currentLeads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
        var currentRejected = currentLeads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
        // Per-epoch performance for this miner (for MinerTracker chart)
        var epochMap = new Map();
        for (var _i = 0, minerLeads_1 = minerLeads; _i < minerLeads_1.length; _i++) {
            var lead = minerLeads_1[_i];
            if (lead.epochId == null)
                continue;
            if (!epochMap.has(lead.epochId))
                epochMap.set(lead.epochId, { accepted: 0, rejected: 0 });
            var stats = epochMap.get(lead.epochId);
            if (lead.decision === 'ACCEPTED')
                stats.accepted++;
            else if (lead.decision === 'REJECTED')
                stats.rejected++;
        }
        var epochPerformance = Array.from(epochMap.entries())
            .map(function (_a) {
            var epochId = _a[0], stats = _a[1];
            return ({
                epoch_id: epochId,
                accepted: stats.accepted,
                rejected: stats.rejected,
                acceptance_rate: (stats.accepted + stats.rejected) > 0
                    ? Math.round((stats.accepted / (stats.accepted + stats.rejected)) * 1000) / 10
                    : 0,
            });
        })
            .sort(function (a, b) { return b.epoch_id - a.epoch_id; });
        // Rejection reasons for this miner (for MinerTracker chart)
        // Excludes LLM errors, validation errors, etc.
        var rejectedLeads = minerLeads.filter(function (l) { return l.decision === 'REJECTED'; });
        var reasonMap = new Map();
        var excludedReasons = ['llm error', 'llm_error', 'no_validation', 'no validation', 'validation error', 'validation_error', 'unknown'];
        var _loop_1 = function (lead) {
            var reason = lead.rejectionReason || 'Unknown';
            var lowerReason = reason.toLowerCase().trim();
            // Skip excluded reasons
            if (excludedReasons.some(function (ex) { return lowerReason.includes(ex); }))
                return "continue";
            reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
        };
        for (var _b = 0, rejectedLeads_1 = rejectedLeads; _b < rejectedLeads_1.length; _b++) {
            var lead = rejectedLeads_1[_b];
            _loop_1(lead);
        }
        var totalFiltered = Array.from(reasonMap.values()).reduce(function (a, b) { return a + b; }, 0);
        var rejectionReasons = Array.from(reasonMap.entries())
            .map(function (_a) {
            var reason = _a[0], count = _a[1];
            return ({
                reason: reason,
                count: count,
                percentage: totalFiltered > 0 ? Math.round((count / totalFiltered) * 1000) / 10 : 0,
            });
        })
            .sort(function (a, b) { return b.count - a.count; });
        return {
            miner_hotkey: hotkey,
            total_submissions: minerLeads.length,
            accepted: accepted,
            rejected: rejected,
            pending: pending,
            acceptance_rate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
            avg_rep_score: Math.round(avgRepScore * 1000) / 1000,
            last20_accepted: last20Accepted,
            last20_rejected: last20Rejected,
            current_accepted: currentAccepted,
            current_rejected: currentRejected,
            epoch_performance: epochPerformance,
            rejection_reasons: rejectionReasons,
        };
    }).sort(function (a, b) { return b.acceptance_rate - a.acceptance_rate; });
}
function calculateEpochStats(leads) {
    var epochMap = new Map();
    for (var _i = 0, leads_3 = leads; _i < leads_3.length; _i++) {
        var lead = leads_3[_i];
        if (lead.epochId == null)
            continue;
        if (!epochMap.has(lead.epochId))
            epochMap.set(lead.epochId, []);
        epochMap.get(lead.epochId).push(lead);
    }
    return Array.from(epochMap.entries()).map(function (_a) {
        var epochId = _a[0], epochLeads = _a[1];
        var accepted = epochLeads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
        var rejected = epochLeads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
        var decided = accepted + rejected;
        // Only calculate avg rep score for ACCEPTED leads
        var acceptedEpochLeads = epochLeads.filter(function (l) { return l.decision === 'ACCEPTED'; });
        var repScores = acceptedEpochLeads.filter(function (l) { return l.repScore != null; }).map(function (l) { return l.repScore; });
        var avgRepScore = repScores.length > 0 ? repScores.reduce(function (a, b) { return a + b; }, 0) / repScores.length : 0;
        // Calculate per-miner stats for this epoch
        var minerMap = new Map();
        for (var _i = 0, epochLeads_1 = epochLeads; _i < epochLeads_1.length; _i++) {
            var lead = epochLeads_1[_i];
            if (!minerMap.has(lead.minerHotkey))
                minerMap.set(lead.minerHotkey, []);
            minerMap.get(lead.minerHotkey).push(lead);
        }
        var miners = Array.from(minerMap.entries()).map(function (_a) {
            var hotkey = _a[0], minerLeads = _a[1];
            var mAccepted = minerLeads.filter(function (l) { return l.decision === 'ACCEPTED'; }).length;
            var mRejected = minerLeads.filter(function (l) { return l.decision === 'REJECTED'; }).length;
            var mDecided = mAccepted + mRejected;
            // Only calculate avg rep score for ACCEPTED leads
            var mAcceptedLeads = minerLeads.filter(function (l) { return l.decision === 'ACCEPTED'; });
            var mRepScores = mAcceptedLeads.filter(function (l) { return l.repScore != null; }).map(function (l) { return l.repScore; });
            var mAvgRepScore = mRepScores.length > 0 ? mRepScores.reduce(function (a, b) { return a + b; }, 0) / mRepScores.length : 0;
            return {
                miner_hotkey: hotkey,
                total: minerLeads.length,
                accepted: mAccepted,
                rejected: mRejected,
                acceptance_rate: mDecided > 0 ? Math.round((mAccepted / mDecided) * 1000) / 10 : 0,
                avg_rep_score: Math.round(mAvgRepScore * 1000) / 1000,
            };
        }).sort(function (a, b) { return b.acceptance_rate - a.acceptance_rate; });
        return {
            epoch_id: epochId,
            total_leads: epochLeads.length,
            accepted: accepted,
            rejected: rejected,
            acceptance_rate: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : 0,
            avg_rep_score: Math.round(avgRepScore * 1000) / 1000,
            miners: miners,
        };
    }).sort(function (a, b) { return b.epoch_id - a.epoch_id; });
}
function calculateLeadInventory(leads) {
    var acceptedLeads = leads.filter(function (l) { return l.decision === 'ACCEPTED'; });
    var dateMap = new Map();
    for (var _i = 0, acceptedLeads_1 = acceptedLeads; _i < acceptedLeads_1.length; _i++) {
        var lead = acceptedLeads_1[_i];
        var date = lead.timestamp.split('T')[0];
        dateMap.set(date, (dateMap.get(date) || 0) + 1);
    }
    var dates = Array.from(dateMap.keys()).sort();
    var cumulative = 0;
    return dates.map(function (date) {
        var newLeads = dateMap.get(date) || 0;
        cumulative += newLeads;
        return { date: date, new_leads: newLeads, cumulative_leads: cumulative };
    });
}
// Rejection reasons to exclude from charts (internal/technical errors)
var EXCLUDED_REJECTION_REASONS = [
    'llm error',
    'llm_error',
    'no_validation',
    'no validation',
    'validation error',
    'validation_error',
    'unknown',
];
function isExcludedReason(reason) {
    var lowerReason = reason.toLowerCase().trim();
    return EXCLUDED_REJECTION_REASONS.some(function (excluded) { return lowerReason.includes(excluded); });
}
function calculateRejectionReasons(leads) {
    var rejected = leads.filter(function (l) { return l.decision === 'REJECTED'; });
    var reasonMap = new Map();
    for (var _i = 0, rejected_1 = rejected; _i < rejected_1.length; _i++) {
        var lead = rejected_1[_i];
        var reason = lead.rejectionReason || 'Unknown';
        // Skip excluded reasons
        if (isExcludedReason(reason))
            continue;
        reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }
    var total = Array.from(reasonMap.values()).reduce(function (a, b) { return a + b; }, 0);
    return Array.from(reasonMap.entries())
        .map(function (_a) {
        var reason = _a[0], count = _a[1];
        return ({
            reason: reason,
            count: count,
            percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        });
    })
        .sort(function (a, b) { return b.count - a.count; });
}
function calculateIncentiveData(leads) {
    var accepted = leads.filter(function (l) { return l.decision === 'ACCEPTED'; });
    var minerMap = new Map();
    for (var _i = 0, accepted_1 = accepted; _i < accepted_1.length; _i++) {
        var lead = accepted_1[_i];
        minerMap.set(lead.minerHotkey, (minerMap.get(lead.minerHotkey) || 0) + 1);
    }
    var total = accepted.length;
    return Array.from(minerMap.entries())
        .map(function (_a) {
        var hotkey = _a[0], count = _a[1];
        return ({
            miner_hotkey: hotkey,
            accepted_leads: count,
            lead_share_pct: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
        });
    })
        .sort(function (a, b) { return b.lead_share_pct - a.lead_share_pct; });
}
