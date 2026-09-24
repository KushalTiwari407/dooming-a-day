/**
* Dooming a Day - Background Service Worker (Manifest V3)
*
* Phase 1: YouTube Shorts Detection & Counting
*
* How this works:
* 1. YouTube is an SPA (Single Page App). When you scroll from one Short to another,
*    YouTube updates the browser URL using history.pushState / history.replaceState.
* 2. chrome.webNavigation.onHistoryStateUpdated catches this URL change instantly.
* 3. We extract the video ID from the URL (e.g. /shorts/abc12345).
* 4. We check whether this video was already counted (deduplication).
* 5. If new, we increment Today's count, Session count, and YouTube count in chrome.storage.local.
* 6. We update the extension badge so the user sees their live count on the toolbar icon.
*/
const STORAGE_KEY = "dooming_a_day_data";
const PREFIX = "[Dooming a Day]";
const log = {
	info: (msg, ...args) => console.log(`${PREFIX} ℹ️ ${msg}`, ...args),
	warn: (msg, ...args) => console.warn(`${PREFIX} ⚠️ ${msg}`, ...args),
	error: (msg, ...args) => console.error(`${PREFIX} ❌ ${msg}`, ...args),
	success: (msg, ...args) => console.log(`${PREFIX} ✅ ${msg}`, ...args)
};
// -----------------------------------------------------------------------------
// 1. YouTube Shorts Detector
// -----------------------------------------------------------------------------
class YouTubeDetector {
	matches(url) {
		if (!url || typeof url !== "string") return false;
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.toLowerCase();
			const isYouTubeDomain = host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com";
			return isYouTubeDomain && parsed.pathname.startsWith("/shorts/");
		} catch {
			return false;
		}
	}
	detect(url) {
		const fallback = {
			platform: "youtube",
			contentType: "unknown",
			contentId: null,
			isShortForm: false,
			canonicalUrl: url
		};
		if (!this.matches(url)) return fallback;
		try {
			const parsed = new URL(url);
			const parts = parsed.pathname.split("/").filter(Boolean);
			// Path format: /shorts/<videoId>
			if (parts.length >= 2 && parts[0] === "shorts") {
				const rawId = parts[1].trim();
				// Match YouTube ID characters (alphanumeric, underscore, dash)
				const idMatch = rawId.match(/^[a-zA-Z0-9_-]{6,16}$/);
				if (idMatch) {
					const videoId = idMatch[0];
					return {
						platform: "youtube",
						contentType: "short",
						contentId: videoId,
						isShortForm: true,
						canonicalUrl: `https://www.youtube.com/shorts/${videoId}`
					};
				}
			}
		} catch (err) {
			log.warn("Failed parsing YouTube URL:", err);
		}
		return fallback;
	}
}
// -----------------------------------------------------------------------------
// 1b. Instagram Reels Detector
// -----------------------------------------------------------------------------
class InstagramDetector {
	matches(url) {
		if (!url || typeof url !== "string") return false;
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.toLowerCase();
			const isInstagramDomain = host === "www.instagram.com" || host === "instagram.com" || host === "m.instagram.com";
			if (!isInstagramDomain) return false;
			const path = parsed.pathname.toLowerCase();
			return path.startsWith("/reel/") || path.startsWith("/reels/");
		} catch {
			return false;
		}
	}
	detect(url) {
		const fallback = {
			platform: "instagram",
			contentType: "unknown",
			contentId: null,
			isShortForm: false,
			canonicalUrl: url
		};
		if (!this.matches(url)) return fallback;
		try {
			const parsed = new URL(url);
			const parts = parsed.pathname.split("/").filter(Boolean);
			// Path format: /reel/<id>/ or /reels/<id>/
			if (parts.length >= 2 && (parts[0] === "reel" || parts[0] === "reels")) {
				const rawId = parts[1].trim();
				const idMatch = rawId.match(/^[a-zA-Z0-9_-]{5,30}$/);
				if (idMatch) {
					const reelId = idMatch[0];
					return {
						platform: "instagram",
						contentType: "reel",
						contentId: reelId,
						isShortForm: true,
						canonicalUrl: `https://www.instagram.com/reel/${reelId}/`
					};
				}
			}
		} catch (err) {
			log.warn("Failed parsing Instagram URL:", err);
		}
		return fallback;
	}
}
// -----------------------------------------------------------------------------
// 1c. TikTok Video Detector (Phase 3)
// -----------------------------------------------------------------------------
class TikTokDetector {
	matches(url) {
		if (!url || typeof url !== "string") return false;
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.toLowerCase();
			const isTikTokDomain = host === "www.tiktok.com" || host === "tiktok.com" || host === "m.tiktok.com";
			if (!isTikTokDomain) return false;
			const path = parsed.pathname.toLowerCase();
			return path.includes("/video/") || path.startsWith("/v/");
		} catch {
			return false;
		}
	}
	detect(url) {
		const fallback = {
			platform: "tiktok",
			contentType: "unknown",
			contentId: null,
			isShortForm: false,
			canonicalUrl: url
		};
		if (!this.matches(url)) return fallback;
		try {
			const parsed = new URL(url);
			const videoMatch = parsed.pathname.match(/\/video\/([0-9]+)/);
			if (videoMatch && videoMatch[1]) {
				return {
					platform: "tiktok",
					contentType: "video",
					contentId: videoMatch[1],
					isShortForm: true,
					canonicalUrl: `https://www.tiktok.com/video/${videoMatch[1]}`
				};
			}
			const vMatch = parsed.pathname.match(/^\/v\/([a-zA-Z0-9]+)/);
			if (vMatch && vMatch[1]) {
				return {
					platform: "tiktok",
					contentType: "video",
					contentId: vMatch[1],
					isShortForm: true,
					canonicalUrl: `https://www.tiktok.com/v/${vMatch[1]}`
				};
			}
		} catch (err) {
			log.warn("Failed parsing TikTok URL:", err);
		}
		return fallback;
	}
}
// -----------------------------------------------------------------------------
// 2. Detector Registry (Modular system: YouTube + Instagram + TikTok)
// -----------------------------------------------------------------------------
class DetectorRegistry {
	constructor() {
		this.detectors = [
			new YouTubeDetector(),
			new InstagramDetector(),
			new TikTokDetector()
		];
	}
	detect(url) {
		if (!url) {
			return {
				platform: "unknown",
				isShortForm: false,
				contentId: null
			};
		}
		for (const detector of this.detectors) {
			if (detector.matches(url)) {
				const res = detector.detect(url);
				if (res.isShortForm && res.contentId) {
					return res;
				}
			}
		}
		return {
			platform: "unknown",
			isShortForm: false,
			contentId: null
		};
	}
}
const detectors = new DetectorRegistry();
// -----------------------------------------------------------------------------
// 3. Storage & Counting Layer
// -----------------------------------------------------------------------------
function getTodayString(date = new Date()) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
function createInitialStorage() {
	const today = getTodayString();
	const nowIso = new Date().toISOString();
	return {
		dailyStats: { [today]: {
			total: 0,
			youtube: 0,
			instagram: 0,
			tiktok: 0
		} },
		events: [],
		currentSession: {
			sessionId: `session_${Date.now()}`,
			startTime: nowIso,
			total: 0,
			youtube: 0,
			instagram: 0,
			tiktok: 0,
			lastContentId: null,
			lastActiveTimestamp: nowIso
		},
		seenContentIdsToday: { [today]: [] },
		settings: {
			notificationsEnabled: true,
			notificationInterval: 10,
			deduplicateByDay: true,
			debugLogging: true
		}
	};
}
async function getStorageData() {
	const defaults = createInitialStorage();
	try {
		const result = await chrome.storage.local.get(STORAGE_KEY);
		if (!result || !result[STORAGE_KEY]) {
			await chrome.storage.local.set({ [STORAGE_KEY]: defaults });
			return defaults;
		}
		const state = result[STORAGE_KEY];
		const today = getTodayString();
		if (!state.dailyStats) state.dailyStats = {};
		if (!state.dailyStats[today]) {
			state.dailyStats[today] = {
				total: 0,
				youtube: 0,
				instagram: 0,
				tiktok: 0
			};
		}
		if (!state.seenContentIdsToday) state.seenContentIdsToday = {};
		if (!state.seenContentIdsToday[today]) {
			state.seenContentIdsToday[today] = [];
		}
		if (!state.currentSession) state.currentSession = defaults.currentSession;
		if (!state.settings) state.settings = defaults.settings;
		if (!Array.isArray(state.events)) state.events = [];
		return state;
	} catch (err) {
		log.error("Storage get error:", err);
		return defaults;
	}
}
async function saveStorageData(data) {
	try {
		await chrome.storage.local.set({ [STORAGE_KEY]: data });
	} catch (err) {
		log.error("Storage set error:", err);
	}
}
async function updateBadge() {
	try {
		const state = await getStorageData();
		const today = getTodayString();
		const count = state.dailyStats[today]?.total || 0;
		const text = count > 0 ? String(count) : "";
		await chrome.action.setBadgeText({ text });
		await chrome.action.setBadgeBackgroundColor({ color: "#E11D48" });
	} catch (err) {
		log.warn("Badge update failed:", err);
	}
}
// -----------------------------------------------------------------------------
// Brainrot Slang Notification System (Every 10 videos up to 100+)
// -----------------------------------------------------------------------------
const BRAINROT_SLANG = {
	10: {
		title: "🧠 10 Reels Down: Level 1 Gyatt Begun",
		message: "Bro is warming up the thumb. 10 in and already cooked! Put the phone down blud."
	},
	20: {
		title: "💀 20 Doomscrolls: Certified Skibidi Moment",
		message: "20 shorts deep! Your attention span just dropped to 3.5 seconds flat. Dopamine bankrupt!"
	},
	30: {
		title: "🧟 30 Videos: Low-Taper Fade on Sanity",
		message: "Bro really watched 30 brainrot clips in one sitting. What happened to \"just one more\"?"
	},
	40: {
		title: "⚠️ 40 Videos: Rizzless Doom Champion",
		message: "40 videos clocked! Your serotonin receptors are officially waving a white flag right now."
	},
	50: {
		title: "🚨 50 Reels: DEADLY BRAINROTTER UNLOCKED! 💀",
		message: "HALF A CENTURY of shorts?! Your brain cells are doing the griddy into the abyss. Touch grass immediately!"
	},
	60: {
		title: "🔥 60 Videos: Terminal Ohio Rizzler",
		message: "60 videos deep in the algorithm trench. The algorithm is feeding you slop and you are gobbling it up!"
	},
	70: {
		title: "⚡ 70 Videos: Infinite Scroll Demon",
		message: "70 shorts! Your thumb has burned more calories than your legs this week. Bro is possessed by the feed."
	},
	80: {
		title: "🕳️ 80 Videos: Deep Abyss Lurker",
		message: "80 clips?! Even the algorithm is concerned for you bro. Your screen time graph looks like Mount Everest."
	},
	90: {
		title: "☣️ 90 Videos: Weaponized Slop Ingestor",
		message: "90 reels! You have ingested enough radioactive dopamine to power a small city. Cease and desist!"
	},
	100: {
		title: "👑 100 DOOMSCROLLS: ASCENDED BRAINROT DEITY 👑",
		message: "100 VIDEOS! Bro has achieved 0 IQ enlightenment! Your brain is literally mashed potatoes. GO TOUCH ACTUAL GRASS!"
	}
};
async function checkAndSendNotification(count, settings) {
	if (!settings?.notificationsEnabled) return;
	if (count <= 0 || count % 10 !== 0) return;
	const slang = BRAINROT_SLANG[count] || {
		title: `💀 ${count} DOOMSCROLLS: BEYOND SALVATION`,
		message: `${count} shorts viewed! Bro is trapped in the digital shadow realm. There is no brain left, only vibes.`
	};
	try {
		if (chrome.notifications?.create) {
			await chrome.notifications.create(`doom_notif_${count}_${Date.now()}`, {
				type: "basic",
				iconUrl: "icons/icon128.png",
				title: slang.title,
				message: slang.message,
				priority: 2
			});
			log.info(`Brainrot Notification dispatched for milestone ${count}!`);
		}
	} catch (err) {
		log.warn("Could not display system notification:", err);
	}
}
async function recordContentWatch(detected, url) {
	if (!detected.isShortForm || !detected.contentId) {
		return {
			recorded: false,
			isDuplicate: false
		};
	}
	const state = await getStorageData();
	const today = getTodayString();
	const now = new Date();
	const nowIso = now.toISOString();
	// Reset session if inactive for more than 30 minutes
	const lastActive = new Date(state.currentSession.lastActiveTimestamp).getTime();
	if (now.getTime() - lastActive > 30 * 60 * 1e3) {
		state.currentSession = {
			sessionId: `session_${Date.now()}`,
			startTime: nowIso,
			total: 0,
			youtube: 0,
			instagram: 0,
			tiktok: 0,
			lastContentId: null,
			lastActiveTimestamp: nowIso
		};
	}
	// Deduplication check
	const isConsecutiveDuplicate = state.currentSession.lastContentId === detected.contentId;
	const seenToday = state.seenContentIdsToday[today] || [];
	const alreadySeenToday = seenToday.includes(detected.contentId);
	// If duplicate, do not increment count
	if (isConsecutiveDuplicate || state.settings.deduplicateByDay && alreadySeenToday) {
		log.info(`Skipped duplicate view for: ${detected.contentId} (${detected.platform})`);
		state.currentSession.lastActiveTimestamp = nowIso;
		await saveStorageData(state);
		return {
			recorded: false,
			isDuplicate: true
		};
	}
	// Increment counters
	const dayStats = state.dailyStats[today];
	dayStats.total += 1;
	if (detected.platform === "youtube") dayStats.youtube += 1;
	else if (detected.platform === "instagram") dayStats.instagram += 1;
	else if (detected.platform === "tiktok") dayStats.tiktok += 1;
	state.currentSession.total += 1;
	if (detected.platform === "youtube") state.currentSession.youtube += 1;
	else if (detected.platform === "instagram") state.currentSession.instagram += 1;
	else if (detected.platform === "tiktok") state.currentSession.tiktok += 1;
	state.currentSession.lastContentId = detected.contentId;
	state.currentSession.lastActiveTimestamp = nowIso;
	if (!seenToday.includes(detected.contentId)) {
		seenToday.push(detected.contentId);
		state.seenContentIdsToday[today] = seenToday;
	}
	// Keep last 150 events in history
	state.events.unshift({
		id: `evt_${Date.now()}`,
		platform: detected.platform,
		contentType: detected.contentType,
		contentId: detected.contentId,
		timestamp: nowIso,
		date: today,
		url
	});
	if (state.events.length > 150) {
		state.events = state.events.slice(0, 150);
	}
	await saveStorageData(state);
	await updateBadge();
	// Check and dispatch brainrot notifications at milestone counts (10, 20, 30... up to 100)
	await checkAndSendNotification(dayStats.total, state.settings);
	log.success(`Recorded ${detected.platform} ${detected.contentType} [${detected.contentId}]. Today's total: ${dayStats.total}, Session: ${state.currentSession.total}`);
	return {
		recorded: true,
		isDuplicate: false
	};
}
// -----------------------------------------------------------------------------
// 4. Navigation Detection Pipeline
// -----------------------------------------------------------------------------
async function handleNavigation(url, trigger) {
	if (!url || typeof url !== "string") return;
	const detected = detectors.detect(url);
	if (detected.isShortForm && detected.contentId) {
		log.info(`Navigation event [${trigger}]: ${url}`);
		await recordContentWatch(detected, url);
	}
}
// Hook into SPA navigation (history state push/replace)
if (chrome.webNavigation?.onHistoryStateUpdated) {
	chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
		if (details.frameId === 0 && details.url) {
			handleNavigation(details.url, "onHistoryStateUpdated");
		}
	});
}
// Hook into initial page load / hard reload
if (chrome.webNavigation?.onCompleted) {
	chrome.webNavigation.onCompleted.addListener((details) => {
		if (details.frameId === 0 && details.url) {
			handleNavigation(details.url, "onCompleted");
		}
	});
}
// Hook into tab url changes
if (chrome.tabs?.onUpdated) {
	chrome.tabs.onUpdated.addListener((_tabId, changeInfo, _tab) => {
		if (changeInfo.url) {
			handleNavigation(changeInfo.url, "tabs.onUpdated");
		}
	});
}
// -----------------------------------------------------------------------------
// 5. Popup & Runtime Communication
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	(async () => {
		try {
			if (message.type === "GET_STATS") {
				const data = await getStorageData();
				sendResponse({
					success: true,
					data
				});
			} else if (message.type === "RESET_TODAY") {
				const state = await getStorageData();
				const today = getTodayString();
				state.dailyStats[today] = {
					total: 0,
					youtube: 0,
					instagram: 0,
					tiktok: 0
				};
				state.seenContentIdsToday[today] = [];
				state.currentSession.total = 0;
				state.currentSession.youtube = 0;
				state.currentSession.lastContentId = null;
				await saveStorageData(state);
				await updateBadge();
				sendResponse({
					success: true,
					data: state
				});
			} else if (message.type === "UPDATE_SETTINGS") {
				const state = await getStorageData();
				state.settings = {
					...state.settings,
					...message.payload
				};
				await saveStorageData(state);
				sendResponse({
					success: true,
					settings: state.settings
				});
			} else if (message.type === "SIMULATE_NAVIGATION") {
				if (message.url) {
					await handleNavigation(message.url, "popup_simulate");
					const state = await getStorageData();
					sendResponse({
						success: true,
						data: state
					});
				} else {
					sendResponse({
						success: false,
						error: "No URL provided"
					});
				}
			} else {
				sendResponse({
					success: false,
					error: "Unknown message"
				});
			}
		} catch (err) {
			log.error("Runtime message error:", err);
			sendResponse({
				success: false,
				error: String(err)
			});
		}
	})();
	return true;
});
// Initialize on install or startup
chrome.runtime.onInstalled.addListener(() => {
	log.info("Dooming a Day extension installed/started.");
	updateBadge();
});

//# sourceMappingURL=data:application/json;base64,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T0FBTztJQUFrQixDQUFDO0dBQzNEO0VBQ0YsU0FBUyxLQUFLO0dBQ1osSUFBSSxNQUFNLDBCQUEwQixHQUFHO0dBQ3ZDLGFBQWE7SUFBRSxTQUFTO0lBQU8sT0FBTyxPQUFPLEdBQUc7R0FBRSxDQUFDO0VBQ3JEO0NBQ0YsRUFBQyxDQUFFO0NBQ0gsT0FBTztBQUNULENBQUM7O0FBR0QsT0FBTyxRQUFRLFlBQVksa0JBQWtCO0NBQzNDLElBQUksS0FBSyw0Q0FBNEM7Q0FDckQsWUFBWTtBQUNkLENBQUMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiYmFja2dyb3VuZC5qcyJdLCJ2ZXJzaW9uIjozLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIERvb21pbmcgYSBEYXkgLSBCYWNrZ3JvdW5kIFNlcnZpY2UgV29ya2VyIChNYW5pZmVzdCBWMylcbiAqXG4gKiBQaGFzZSAxOiBZb3VUdWJlIFNob3J0cyBEZXRlY3Rpb24gJiBDb3VudGluZ1xuICpcbiAqIEhvdyB0aGlzIHdvcmtzOlxuICogMS4gWW91VHViZSBpcyBhbiBTUEEgKFNpbmdsZSBQYWdlIEFwcCkuIFdoZW4geW91IHNjcm9sbCBmcm9tIG9uZSBTaG9ydCB0byBhbm90aGVyLFxuICogICAgWW91VHViZSB1cGRhdGVzIHRoZSBicm93c2VyIFVSTCB1c2luZyBoaXN0b3J5LnB1c2hTdGF0ZSAvIGhpc3RvcnkucmVwbGFjZVN0YXRlLlxuICogMi4gY2hyb21lLndlYk5hdmlnYXRpb24ub25IaXN0b3J5U3RhdGVVcGRhdGVkIGNhdGNoZXMgdGhpcyBVUkwgY2hhbmdlIGluc3RhbnRseS5cbiAqIDMuIFdlIGV4dHJhY3QgdGhlIHZpZGVvIElEIGZyb20gdGhlIFVSTCAoZS5nLiAvc2hvcnRzL2FiYzEyMzQ1KS5cbiAqIDQuIFdlIGNoZWNrIHdoZXRoZXIgdGhpcyB2aWRlbyB3YXMgYWxyZWFkeSBjb3VudGVkIChkZWR1cGxpY2F0aW9uKS5cbiAqIDUuIElmIG5ldywgd2UgaW5jcmVtZW50IFRvZGF5J3MgY291bnQsIFNlc3Npb24gY291bnQsIGFuZCBZb3VUdWJlIGNvdW50IGluIGNocm9tZS5zdG9yYWdlLmxvY2FsLlxuICogNi4gV2UgdXBkYXRlIHRoZSBleHRlbnNpb24gYmFkZ2Ugc28gdGhlIHVzZXIgc2VlcyB0aGVpciBsaXZlIGNvdW50IG9uIHRoZSB0b29sYmFyIGljb24uXG4gKi9cblxuY29uc3QgU1RPUkFHRV9LRVkgPSAnZG9vbWluZ19hX2RheV9kYXRhJztcbmNvbnN0IFBSRUZJWCA9ICdbRG9vbWluZyBhIERheV0nO1xuXG5jb25zdCBsb2cgPSB7XG4gIGluZm86IChtc2csIC4uLmFyZ3MpID0+IGNvbnNvbGUubG9nKGAke1BSRUZJWH0g4oS577iPICR7bXNnfWAsIC4uLmFyZ3MpLFxuICB3YXJuOiAobXNnLCAuLi5hcmdzKSA9PiBjb25zb2xlLndhcm4oYCR7UFJFRklYfSDimqDvuI8gJHttc2d9YCwgLi4uYXJncyksXG4gIGVycm9yOiAobXNnLCAuLi5hcmdzKSA9PiBjb25zb2xlLmVycm9yKGAke1BSRUZJWH0g4p2MICR7bXNnfWAsIC4uLmFyZ3MpLFxuICBzdWNjZXNzOiAobXNnLCAuLi5hcmdzKSA9PiBjb25zb2xlLmxvZyhgJHtQUkVGSVh9IOKchSAke21zZ31gLCAuLi5hcmdzKSxcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAxLiBZb3VUdWJlIFNob3J0cyBEZXRlY3RvclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNsYXNzIFlvdVR1YmVEZXRlY3RvciB7XG4gIG1hdGNoZXModXJsKSB7XG4gICAgaWYgKCF1cmwgfHwgdHlwZW9mIHVybCAhPT0gJ3N0cmluZycpIHJldHVybiBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgY29uc3QgaG9zdCA9IHBhcnNlZC5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgY29uc3QgaXNZb3VUdWJlRG9tYWluID1cbiAgICAgICAgaG9zdCA9PT0gJ3d3dy55b3V0dWJlLmNvbScgfHxcbiAgICAgICAgaG9zdCA9PT0gJ3lvdXR1YmUuY29tJyB8fFxuICAgICAgICBob3N0ID09PSAnbS55b3V0dWJlLmNvbSc7XG4gICAgICByZXR1cm4gaXNZb3VUdWJlRG9tYWluICYmIHBhcnNlZC5wYXRobmFtZS5zdGFydHNXaXRoKCcvc2hvcnRzLycpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGRldGVjdCh1cmwpIHtcbiAgICBjb25zdCBmYWxsYmFjayA9IHtcbiAgICAgIHBsYXRmb3JtOiAneW91dHViZScsXG4gICAgICBjb250ZW50VHlwZTogJ3Vua25vd24nLFxuICAgICAgY29udGVudElkOiBudWxsLFxuICAgICAgaXNTaG9ydEZvcm06IGZhbHNlLFxuICAgICAgY2Fub25pY2FsVXJsOiB1cmwsXG4gICAgfTtcblxuICAgIGlmICghdGhpcy5tYXRjaGVzKHVybCkpIHJldHVybiBmYWxsYmFjaztcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICBjb25zdCBwYXJ0cyA9IHBhcnNlZC5wYXRobmFtZS5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcbiAgICAgIC8vIFBhdGggZm9ybWF0OiAvc2hvcnRzLzx2aWRlb0lkPlxuICAgICAgaWYgKHBhcnRzLmxlbmd0aCA+PSAyICYmIHBhcnRzWzBdID09PSAnc2hvcnRzJykge1xuICAgICAgICBjb25zdCByYXdJZCA9IHBhcnRzWzFdLnRyaW0oKTtcbiAgICAgICAgLy8gTWF0Y2ggWW91VHViZSBJRCBjaGFyYWN0ZXJzIChhbHBoYW51bWVyaWMsIHVuZGVyc2NvcmUsIGRhc2gpXG4gICAgICAgIGNvbnN0IGlkTWF0Y2ggPSByYXdJZC5tYXRjaCgvXlthLXpBLVowLTlfLV17NiwxNn0kLyk7XG4gICAgICAgIGlmIChpZE1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmlkZW9JZCA9IGlkTWF0Y2hbMF07XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBsYXRmb3JtOiAneW91dHViZScsXG4gICAgICAgICAgICBjb250ZW50VHlwZTogJ3Nob3J0JyxcbiAgICAgICAgICAgIGNvbnRlbnRJZDogdmlkZW9JZCxcbiAgICAgICAgICAgIGlzU2hvcnRGb3JtOiB0cnVlLFxuICAgICAgICAgICAgY2Fub25pY2FsVXJsOiBgaHR0cHM6Ly93d3cueW91dHViZS5jb20vc2hvcnRzLyR7dmlkZW9JZH1gLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy53YXJuKCdGYWlsZWQgcGFyc2luZyBZb3VUdWJlIFVSTDonLCBlcnIpO1xuICAgIH1cblxuICAgIHJldHVybiBmYWxsYmFjaztcbiAgfVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gMWIuIEluc3RhZ3JhbSBSZWVscyBEZXRlY3RvclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNsYXNzIEluc3RhZ3JhbURldGVjdG9yIHtcbiAgbWF0Y2hlcyh1cmwpIHtcbiAgICBpZiAoIXVybCB8fCB0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBpc0luc3RhZ3JhbURvbWFpbiA9XG4gICAgICAgIGhvc3QgPT09ICd3d3cuaW5zdGFncmFtLmNvbScgfHxcbiAgICAgICAgaG9zdCA9PT0gJ2luc3RhZ3JhbS5jb20nIHx8XG4gICAgICAgIGhvc3QgPT09ICdtLmluc3RhZ3JhbS5jb20nO1xuICAgICAgaWYgKCFpc0luc3RhZ3JhbURvbWFpbikgcmV0dXJuIGZhbHNlO1xuICAgICAgY29uc3QgcGF0aCA9IHBhcnNlZC5wYXRobmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgcmV0dXJuIHBhdGguc3RhcnRzV2l0aCgnL3JlZWwvJykgfHwgcGF0aC5zdGFydHNXaXRoKCcvcmVlbHMvJyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgZGV0ZWN0KHVybCkge1xuICAgIGNvbnN0IGZhbGxiYWNrID0ge1xuICAgICAgcGxhdGZvcm06ICdpbnN0YWdyYW0nLFxuICAgICAgY29udGVudFR5cGU6ICd1bmtub3duJyxcbiAgICAgIGNvbnRlbnRJZDogbnVsbCxcbiAgICAgIGlzU2hvcnRGb3JtOiBmYWxzZSxcbiAgICAgIGNhbm9uaWNhbFVybDogdXJsLFxuICAgIH07XG5cbiAgICBpZiAoIXRoaXMubWF0Y2hlcyh1cmwpKSByZXR1cm4gZmFsbGJhY2s7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gbmV3IFVSTCh1cmwpO1xuICAgICAgY29uc3QgcGFydHMgPSBwYXJzZWQucGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAvLyBQYXRoIGZvcm1hdDogL3JlZWwvPGlkPi8gb3IgL3JlZWxzLzxpZD4vXG4gICAgICBpZiAocGFydHMubGVuZ3RoID49IDIgJiYgKHBhcnRzWzBdID09PSAncmVlbCcgfHwgcGFydHNbMF0gPT09ICdyZWVscycpKSB7XG4gICAgICAgIGNvbnN0IHJhd0lkID0gcGFydHNbMV0udHJpbSgpO1xuICAgICAgICBjb25zdCBpZE1hdGNoID0gcmF3SWQubWF0Y2goL15bYS16QS1aMC05Xy1dezUsMzB9JC8pO1xuICAgICAgICBpZiAoaWRNYXRjaCkge1xuICAgICAgICAgIGNvbnN0IHJlZWxJZCA9IGlkTWF0Y2hbMF07XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBsYXRmb3JtOiAnaW5zdGFncmFtJyxcbiAgICAgICAgICAgIGNvbnRlbnRUeXBlOiAncmVlbCcsXG4gICAgICAgICAgICBjb250ZW50SWQ6IHJlZWxJZCxcbiAgICAgICAgICAgIGlzU2hvcnRGb3JtOiB0cnVlLFxuICAgICAgICAgICAgY2Fub25pY2FsVXJsOiBgaHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS9yZWVsLyR7cmVlbElkfS9gLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGxvZy53YXJuKCdGYWlsZWQgcGFyc2luZyBJbnN0YWdyYW0gVVJMOicsIGVycik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbGxiYWNrO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyAxYy4gVGlrVG9rIFZpZGVvIERldGVjdG9yIChQaGFzZSAzKVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNsYXNzIFRpa1Rva0RldGVjdG9yIHtcbiAgbWF0Y2hlcyh1cmwpIHtcbiAgICBpZiAoIXVybCB8fCB0eXBlb2YgdXJsICE9PSAnc3RyaW5nJykgcmV0dXJuIGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBuZXcgVVJMKHVybCk7XG4gICAgICBjb25zdCBob3N0ID0gcGFyc2VkLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICBjb25zdCBpc1Rpa1Rva0RvbWFpbiA9XG4gICAgICAgIGhvc3QgPT09ICd3d3cudGlrdG9rLmNvbScgfHxcbiAgICAgICAgaG9zdCA9PT0gJ3Rpa3Rvay5jb20nIHx8XG4gICAgICAgIGhvc3QgPT09ICdtLnRpa3Rvay5jb20nO1xuICAgICAgaWYgKCFpc1Rpa1Rva0RvbWFpbikgcmV0dXJuIGZhbHNlO1xuICAgICAgY29uc3QgcGF0aCA9IHBhcnNlZC5wYXRobmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgcmV0dXJuIHBhdGguaW5jbHVkZXMoJy92aWRlby8nKSB8fCBwYXRoLnN0YXJ0c1dpdGgoJy92LycpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGRldGVjdCh1cmwpIHtcbiAgICBjb25zdCBmYWxsYmFjayA9IHtcbiAgICAgIHBsYXRmb3JtOiAndGlrdG9rJyxcbiAgICAgIGNvbnRlbnRUeXBlOiAndW5rbm93bicsXG4gICAgICBjb250ZW50SWQ6IG51bGwsXG4gICAgICBpc1Nob3J0Rm9ybTogZmFsc2UsXG4gICAgICBjYW5vbmljYWxVcmw6IHVybCxcbiAgICB9O1xuXG4gICAgaWYgKCF0aGlzLm1hdGNoZXModXJsKSkgcmV0dXJuIGZhbGxiYWNrO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IG5ldyBVUkwodXJsKTtcbiAgICAgIGNvbnN0IHZpZGVvTWF0Y2ggPSBwYXJzZWQucGF0aG5hbWUubWF0Y2goL1xcL3ZpZGVvXFwvKFswLTldKykvKTtcbiAgICAgIGlmICh2aWRlb01hdGNoICYmIHZpZGVvTWF0Y2hbMV0pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBwbGF0Zm9ybTogJ3Rpa3RvaycsXG4gICAgICAgICAgY29udGVudFR5cGU6ICd2aWRlbycsXG4gICAgICAgICAgY29udGVudElkOiB2aWRlb01hdGNoWzFdLFxuICAgICAgICAgIGlzU2hvcnRGb3JtOiB0cnVlLFxuICAgICAgICAgIGNhbm9uaWNhbFVybDogYGh0dHBzOi8vd3d3LnRpa3Rvay5jb20vdmlkZW8vJHt2aWRlb01hdGNoWzFdfWAsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjb25zdCB2TWF0Y2ggPSBwYXJzZWQucGF0aG5hbWUubWF0Y2goL15cXC92XFwvKFthLXpBLVowLTldKykvKTtcbiAgICAgIGlmICh2TWF0Y2ggJiYgdk1hdGNoWzFdKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcGxhdGZvcm06ICd0aWt0b2snLFxuICAgICAgICAgIGNvbnRlbnRUeXBlOiAndmlkZW8nLFxuICAgICAgICAgIGNvbnRlbnRJZDogdk1hdGNoWzFdLFxuICAgICAgICAgIGlzU2hvcnRGb3JtOiB0cnVlLFxuICAgICAgICAgIGNhbm9uaWNhbFVybDogYGh0dHBzOi8vd3d3LnRpa3Rvay5jb20vdi8ke3ZNYXRjaFsxXX1gLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nLndhcm4oJ0ZhaWxlZCBwYXJzaW5nIFRpa1RvayBVUkw6JywgZXJyKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsbGJhY2s7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIDIuIERldGVjdG9yIFJlZ2lzdHJ5IChNb2R1bGFyIHN5c3RlbTogWW91VHViZSArIEluc3RhZ3JhbSArIFRpa1Rvaylcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jbGFzcyBEZXRlY3RvclJlZ2lzdHJ5IHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5kZXRlY3RvcnMgPSBbbmV3IFlvdVR1YmVEZXRlY3RvcigpLCBuZXcgSW5zdGFncmFtRGV0ZWN0b3IoKSwgbmV3IFRpa1Rva0RldGVjdG9yKCldO1xuICB9XG5cbiAgZGV0ZWN0KHVybCkge1xuICAgIGlmICghdXJsKSB7XG4gICAgICByZXR1cm4geyBwbGF0Zm9ybTogJ3Vua25vd24nLCBpc1Nob3J0Rm9ybTogZmFsc2UsIGNvbnRlbnRJZDogbnVsbCB9O1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGRldGVjdG9yIG9mIHRoaXMuZGV0ZWN0b3JzKSB7XG4gICAgICBpZiAoZGV0ZWN0b3IubWF0Y2hlcyh1cmwpKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGRldGVjdG9yLmRldGVjdCh1cmwpO1xuICAgICAgICBpZiAocmVzLmlzU2hvcnRGb3JtICYmIHJlcy5jb250ZW50SWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IHBsYXRmb3JtOiAndW5rbm93bicsIGlzU2hvcnRGb3JtOiBmYWxzZSwgY29udGVudElkOiBudWxsIH07XG4gIH1cbn1cblxuY29uc3QgZGV0ZWN0b3JzID0gbmV3IERldGVjdG9yUmVnaXN0cnkoKTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIDMuIFN0b3JhZ2UgJiBDb3VudGluZyBMYXllclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmZ1bmN0aW9uIGdldFRvZGF5U3RyaW5nKGRhdGUgPSBuZXcgRGF0ZSgpKSB7XG4gIGNvbnN0IHkgPSBkYXRlLmdldEZ1bGxZZWFyKCk7XG4gIGNvbnN0IG0gPSBTdHJpbmcoZGF0ZS5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgY29uc3QgZCA9IFN0cmluZyhkYXRlLmdldERhdGUoKSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgcmV0dXJuIGAke3l9LSR7bX0tJHtkfWA7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxTdG9yYWdlKCkge1xuICBjb25zdCB0b2RheSA9IGdldFRvZGF5U3RyaW5nKCk7XG4gIGNvbnN0IG5vd0lzbyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgcmV0dXJuIHtcbiAgICBkYWlseVN0YXRzOiB7XG4gICAgICBbdG9kYXldOiB7IHRvdGFsOiAwLCB5b3V0dWJlOiAwLCBpbnN0YWdyYW06IDAsIHRpa3RvazogMCB9LFxuICAgIH0sXG4gICAgZXZlbnRzOiBbXSxcbiAgICBjdXJyZW50U2Vzc2lvbjoge1xuICAgICAgc2Vzc2lvbklkOiBgc2Vzc2lvbl8ke0RhdGUubm93KCl9YCxcbiAgICAgIHN0YXJ0VGltZTogbm93SXNvLFxuICAgICAgdG90YWw6IDAsXG4gICAgICB5b3V0dWJlOiAwLFxuICAgICAgaW5zdGFncmFtOiAwLFxuICAgICAgdGlrdG9rOiAwLFxuICAgICAgbGFzdENvbnRlbnRJZDogbnVsbCxcbiAgICAgIGxhc3RBY3RpdmVUaW1lc3RhbXA6IG5vd0lzbyxcbiAgICB9LFxuICAgIHNlZW5Db250ZW50SWRzVG9kYXk6IHtcbiAgICAgIFt0b2RheV06IFtdLFxuICAgIH0sXG4gICAgc2V0dGluZ3M6IHtcbiAgICAgIG5vdGlmaWNhdGlvbnNFbmFibGVkOiB0cnVlLFxuICAgICAgbm90aWZpY2F0aW9uSW50ZXJ2YWw6IDEwLFxuICAgICAgZGVkdXBsaWNhdGVCeURheTogdHJ1ZSxcbiAgICAgIGRlYnVnTG9nZ2luZzogdHJ1ZSxcbiAgICB9LFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTdG9yYWdlRGF0YSgpIHtcbiAgY29uc3QgZGVmYXVsdHMgPSBjcmVhdGVJbml0aWFsU3RvcmFnZSgpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldChTVE9SQUdFX0tFWSk7XG4gICAgaWYgKCFyZXN1bHQgfHwgIXJlc3VsdFtTVE9SQUdFX0tFWV0pIHtcbiAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IFtTVE9SQUdFX0tFWV06IGRlZmF1bHRzIH0pO1xuICAgICAgcmV0dXJuIGRlZmF1bHRzO1xuICAgIH1cbiAgICBjb25zdCBzdGF0ZSA9IHJlc3VsdFtTVE9SQUdFX0tFWV07XG4gICAgY29uc3QgdG9kYXkgPSBnZXRUb2RheVN0cmluZygpO1xuICAgIGlmICghc3RhdGUuZGFpbHlTdGF0cykgc3RhdGUuZGFpbHlTdGF0cyA9IHt9O1xuICAgIGlmICghc3RhdGUuZGFpbHlTdGF0c1t0b2RheV0pIHtcbiAgICAgIHN0YXRlLmRhaWx5U3RhdHNbdG9kYXldID0geyB0b3RhbDogMCwgeW91dHViZTogMCwgaW5zdGFncmFtOiAwLCB0aWt0b2s6IDAgfTtcbiAgICB9XG4gICAgaWYgKCFzdGF0ZS5zZWVuQ29udGVudElkc1RvZGF5KSBzdGF0ZS5zZWVuQ29udGVudElkc1RvZGF5ID0ge307XG4gICAgaWYgKCFzdGF0ZS5zZWVuQ29udGVudElkc1RvZGF5W3RvZGF5XSkge1xuICAgICAgc3RhdGUuc2VlbkNvbnRlbnRJZHNUb2RheVt0b2RheV0gPSBbXTtcbiAgICB9XG4gICAgaWYgKCFzdGF0ZS5jdXJyZW50U2Vzc2lvbikgc3RhdGUuY3VycmVudFNlc3Npb24gPSBkZWZhdWx0cy5jdXJyZW50U2Vzc2lvbjtcbiAgICBpZiAoIXN0YXRlLnNldHRpbmdzKSBzdGF0ZS5zZXR0aW5ncyA9IGRlZmF1bHRzLnNldHRpbmdzO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShzdGF0ZS5ldmVudHMpKSBzdGF0ZS5ldmVudHMgPSBbXTtcbiAgICByZXR1cm4gc3RhdGU7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZy5lcnJvcignU3RvcmFnZSBnZXQgZXJyb3I6JywgZXJyKTtcbiAgICByZXR1cm4gZGVmYXVsdHM7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZVN0b3JhZ2VEYXRhKGRhdGEpIHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBbU1RPUkFHRV9LRVldOiBkYXRhIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cuZXJyb3IoJ1N0b3JhZ2Ugc2V0IGVycm9yOicsIGVycik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlQmFkZ2UoKSB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3RhdGUgPSBhd2FpdCBnZXRTdG9yYWdlRGF0YSgpO1xuICAgIGNvbnN0IHRvZGF5ID0gZ2V0VG9kYXlTdHJpbmcoKTtcbiAgICBjb25zdCBjb3VudCA9IHN0YXRlLmRhaWx5U3RhdHNbdG9kYXldPy50b3RhbCB8fCAwO1xuICAgIGNvbnN0IHRleHQgPSBjb3VudCA+IDAgPyBTdHJpbmcoY291bnQpIDogJyc7XG4gICAgYXdhaXQgY2hyb21lLmFjdGlvbi5zZXRCYWRnZVRleHQoeyB0ZXh0IH0pO1xuICAgIGF3YWl0IGNocm9tZS5hY3Rpb24uc2V0QmFkZ2VCYWNrZ3JvdW5kQ29sb3IoeyBjb2xvcjogJyNFMTFENDgnIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBsb2cud2FybignQmFkZ2UgdXBkYXRlIGZhaWxlZDonLCBlcnIpO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBCcmFpbnJvdCBTbGFuZyBOb3RpZmljYXRpb24gU3lzdGVtIChFdmVyeSAxMCB2aWRlb3MgdXAgdG8gMTAwKylcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBCUkFJTlJPVF9TTEFORyA9IHtcbiAgMTA6IHtcbiAgICB0aXRsZTogJ/Cfp6AgMTAgUmVlbHMgRG93bjogTGV2ZWwgMSBHeWF0dCBCZWd1bicsXG4gICAgbWVzc2FnZTogJ0JybyBpcyB3YXJtaW5nIHVwIHRoZSB0aHVtYi4gMTAgaW4gYW5kIGFscmVhZHkgY29va2VkISBQdXQgdGhlIHBob25lIGRvd24gYmx1ZC4nLFxuICB9LFxuICAyMDoge1xuICAgIHRpdGxlOiAn8J+SgCAyMCBEb29tc2Nyb2xsczogQ2VydGlmaWVkIFNraWJpZGkgTW9tZW50JyxcbiAgICBtZXNzYWdlOiAnMjAgc2hvcnRzIGRlZXAhIFlvdXIgYXR0ZW50aW9uIHNwYW4ganVzdCBkcm9wcGVkIHRvIDMuNSBzZWNvbmRzIGZsYXQuIERvcGFtaW5lIGJhbmtydXB0IScsXG4gIH0sXG4gIDMwOiB7XG4gICAgdGl0bGU6ICfwn6efIDMwIFZpZGVvczogTG93LVRhcGVyIEZhZGUgb24gU2FuaXR5JyxcbiAgICBtZXNzYWdlOiAnQnJvIHJlYWxseSB3YXRjaGVkIDMwIGJyYWlucm90IGNsaXBzIGluIG9uZSBzaXR0aW5nLiBXaGF0IGhhcHBlbmVkIHRvIFwianVzdCBvbmUgbW9yZVwiPycsXG4gIH0sXG4gIDQwOiB7XG4gICAgdGl0bGU6ICfimqDvuI8gNDAgVmlkZW9zOiBSaXp6bGVzcyBEb29tIENoYW1waW9uJyxcbiAgICBtZXNzYWdlOiAnNDAgdmlkZW9zIGNsb2NrZWQhIFlvdXIgc2Vyb3RvbmluIHJlY2VwdG9ycyBhcmUgb2ZmaWNpYWxseSB3YXZpbmcgYSB3aGl0ZSBmbGFnIHJpZ2h0IG5vdy4nLFxuICB9LFxuICA1MDoge1xuICAgIHRpdGxlOiAn8J+aqCA1MCBSZWVsczogREVBRExZIEJSQUlOUk9UVEVSIFVOTE9DS0VEISDwn5KAJyxcbiAgICBtZXNzYWdlOiAnSEFMRiBBIENFTlRVUlkgb2Ygc2hvcnRzPyEgWW91ciBicmFpbiBjZWxscyBhcmUgZG9pbmcgdGhlIGdyaWRkeSBpbnRvIHRoZSBhYnlzcy4gVG91Y2ggZ3Jhc3MgaW1tZWRpYXRlbHkhJyxcbiAgfSxcbiAgNjA6IHtcbiAgICB0aXRsZTogJ/CflKUgNjAgVmlkZW9zOiBUZXJtaW5hbCBPaGlvIFJpenpsZXInLFxuICAgIG1lc3NhZ2U6ICc2MCB2aWRlb3MgZGVlcCBpbiB0aGUgYWxnb3JpdGhtIHRyZW5jaC4gVGhlIGFsZ29yaXRobSBpcyBmZWVkaW5nIHlvdSBzbG9wIGFuZCB5b3UgYXJlIGdvYmJsaW5nIGl0IHVwIScsXG4gIH0sXG4gIDcwOiB7XG4gICAgdGl0bGU6ICfimqEgNzAgVmlkZW9zOiBJbmZpbml0ZSBTY3JvbGwgRGVtb24nLFxuICAgIG1lc3NhZ2U6ICc3MCBzaG9ydHMhIFlvdXIgdGh1bWIgaGFzIGJ1cm5lZCBtb3JlIGNhbG9yaWVzIHRoYW4geW91ciBsZWdzIHRoaXMgd2Vlay4gQnJvIGlzIHBvc3Nlc3NlZCBieSB0aGUgZmVlZC4nLFxuICB9LFxuICA4MDoge1xuICAgIHRpdGxlOiAn8J+Vs++4jyA4MCBWaWRlb3M6IERlZXAgQWJ5c3MgTHVya2VyJyxcbiAgICBtZXNzYWdlOiAnODAgY2xpcHM/ISBFdmVuIHRoZSBhbGdvcml0aG0gaXMgY29uY2VybmVkIGZvciB5b3UgYnJvLiBZb3VyIHNjcmVlbiB0aW1lIGdyYXBoIGxvb2tzIGxpa2UgTW91bnQgRXZlcmVzdC4nLFxuICB9LFxuICA5MDoge1xuICAgIHRpdGxlOiAn4pij77iPIDkwIFZpZGVvczogV2VhcG9uaXplZCBTbG9wIEluZ2VzdG9yJyxcbiAgICBtZXNzYWdlOiAnOTAgcmVlbHMhIFlvdSBoYXZlIGluZ2VzdGVkIGVub3VnaCByYWRpb2FjdGl2ZSBkb3BhbWluZSB0byBwb3dlciBhIHNtYWxsIGNpdHkuIENlYXNlIGFuZCBkZXNpc3QhJyxcbiAgfSxcbiAgMTAwOiB7XG4gICAgdGl0bGU6ICfwn5GRIDEwMCBET09NU0NST0xMUzogQVNDRU5ERUQgQlJBSU5ST1QgREVJVFkg8J+RkScsXG4gICAgbWVzc2FnZTogJzEwMCBWSURFT1MhIEJybyBoYXMgYWNoaWV2ZWQgMCBJUSBlbmxpZ2h0ZW5tZW50ISBZb3VyIGJyYWluIGlzIGxpdGVyYWxseSBtYXNoZWQgcG90YXRvZXMuIEdPIFRPVUNIIEFDVFVBTCBHUkFTUyEnLFxuICB9LFxufTtcblxuYXN5bmMgZnVuY3Rpb24gY2hlY2tBbmRTZW5kTm90aWZpY2F0aW9uKGNvdW50LCBzZXR0aW5ncykge1xuICBpZiAoIXNldHRpbmdzPy5ub3RpZmljYXRpb25zRW5hYmxlZCkgcmV0dXJuO1xuICBpZiAoY291bnQgPD0gMCB8fCBjb3VudCAlIDEwICE9PSAwKSByZXR1cm47XG5cbiAgY29uc3Qgc2xhbmcgPSBCUkFJTlJPVF9TTEFOR1tjb3VudF0gfHwge1xuICAgIHRpdGxlOiBg8J+SgCAke2NvdW50fSBET09NU0NST0xMUzogQkVZT05EIFNBTFZBVElPTmAsXG4gICAgbWVzc2FnZTogYCR7Y291bnR9IHNob3J0cyB2aWV3ZWQhIEJybyBpcyB0cmFwcGVkIGluIHRoZSBkaWdpdGFsIHNoYWRvdyByZWFsbS4gVGhlcmUgaXMgbm8gYnJhaW4gbGVmdCwgb25seSB2aWJlcy5gLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgaWYgKGNocm9tZS5ub3RpZmljYXRpb25zPy5jcmVhdGUpIHtcbiAgICAgIGF3YWl0IGNocm9tZS5ub3RpZmljYXRpb25zLmNyZWF0ZShgZG9vbV9ub3RpZl8ke2NvdW50fV8ke0RhdGUubm93KCl9YCwge1xuICAgICAgICB0eXBlOiAnYmFzaWMnLFxuICAgICAgICBpY29uVXJsOiAnaWNvbnMvaWNvbjEyOC5wbmcnLFxuICAgICAgICB0aXRsZTogc2xhbmcudGl0bGUsXG4gICAgICAgIG1lc3NhZ2U6IHNsYW5nLm1lc3NhZ2UsXG4gICAgICAgIHByaW9yaXR5OiAyLFxuICAgICAgfSk7XG4gICAgICBsb2cuaW5mbyhgQnJhaW5yb3QgTm90aWZpY2F0aW9uIGRpc3BhdGNoZWQgZm9yIG1pbGVzdG9uZSAke2NvdW50fSFgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGxvZy53YXJuKCdDb3VsZCBub3QgZGlzcGxheSBzeXN0ZW0gbm90aWZpY2F0aW9uOicsIGVycik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVjb3JkQ29udGVudFdhdGNoKGRldGVjdGVkLCB1cmwpIHtcbiAgaWYgKCFkZXRlY3RlZC5pc1Nob3J0Rm9ybSB8fCAhZGV0ZWN0ZWQuY29udGVudElkKSB7XG4gICAgcmV0dXJuIHsgcmVjb3JkZWQ6IGZhbHNlLCBpc0R1cGxpY2F0ZTogZmFsc2UgfTtcbiAgfVxuXG4gIGNvbnN0IHN0YXRlID0gYXdhaXQgZ2V0U3RvcmFnZURhdGEoKTtcbiAgY29uc3QgdG9kYXkgPSBnZXRUb2RheVN0cmluZygpO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICBjb25zdCBub3dJc28gPSBub3cudG9JU09TdHJpbmcoKTtcblxuICAvLyBSZXNldCBzZXNzaW9uIGlmIGluYWN0aXZlIGZvciBtb3JlIHRoYW4gMzAgbWludXRlc1xuICBjb25zdCBsYXN0QWN0aXZlID0gbmV3IERhdGUoc3RhdGUuY3VycmVudFNlc3Npb24ubGFzdEFjdGl2ZVRpbWVzdGFtcCkuZ2V0VGltZSgpO1xuICBpZiAobm93LmdldFRpbWUoKSAtIGxhc3RBY3RpdmUgPiAzMCAqIDYwICogMTAwMCkge1xuICAgIHN0YXRlLmN1cnJlbnRTZXNzaW9uID0ge1xuICAgICAgc2Vzc2lvbklkOiBgc2Vzc2lvbl8ke0RhdGUubm93KCl9YCxcbiAgICAgIHN0YXJ0VGltZTogbm93SXNvLFxuICAgICAgdG90YWw6IDAsXG4gICAgICB5b3V0dWJlOiAwLFxuICAgICAgaW5zdGFncmFtOiAwLFxuICAgICAgdGlrdG9rOiAwLFxuICAgICAgbGFzdENvbnRlbnRJZDogbnVsbCxcbiAgICAgIGxhc3RBY3RpdmVUaW1lc3RhbXA6IG5vd0lzbyxcbiAgICB9O1xuICB9XG5cbiAgLy8gRGVkdXBsaWNhdGlvbiBjaGVja1xuICBjb25zdCBpc0NvbnNlY3V0aXZlRHVwbGljYXRlID0gc3RhdGUuY3VycmVudFNlc3Npb24ubGFzdENvbnRlbnRJZCA9PT0gZGV0ZWN0ZWQuY29udGVudElkO1xuICBjb25zdCBzZWVuVG9kYXkgPSBzdGF0ZS5zZWVuQ29udGVudElkc1RvZGF5W3RvZGF5XSB8fCBbXTtcbiAgY29uc3QgYWxyZWFkeVNlZW5Ub2RheSA9IHNlZW5Ub2RheS5pbmNsdWRlcyhkZXRlY3RlZC5jb250ZW50SWQpO1xuXG4gIC8vIElmIGR1cGxpY2F0ZSwgZG8gbm90IGluY3JlbWVudCBjb3VudFxuICBpZiAoaXNDb25zZWN1dGl2ZUR1cGxpY2F0ZSB8fCAoc3RhdGUuc2V0dGluZ3MuZGVkdXBsaWNhdGVCeURheSAmJiBhbHJlYWR5U2VlblRvZGF5KSkge1xuICAgIGxvZy5pbmZvKGBTa2lwcGVkIGR1cGxpY2F0ZSB2aWV3IGZvcjogJHtkZXRlY3RlZC5jb250ZW50SWR9ICgke2RldGVjdGVkLnBsYXRmb3JtfSlgKTtcbiAgICBzdGF0ZS5jdXJyZW50U2Vzc2lvbi5sYXN0QWN0aXZlVGltZXN0YW1wID0gbm93SXNvO1xuICAgIGF3YWl0IHNhdmVTdG9yYWdlRGF0YShzdGF0ZSk7XG4gICAgcmV0dXJuIHsgcmVjb3JkZWQ6IGZhbHNlLCBpc0R1cGxpY2F0ZTogdHJ1ZSB9O1xuICB9XG5cbiAgLy8gSW5jcmVtZW50IGNvdW50ZXJzXG4gIGNvbnN0IGRheVN0YXRzID0gc3RhdGUuZGFpbHlTdGF0c1t0b2RheV07XG4gIGRheVN0YXRzLnRvdGFsICs9IDE7XG4gIGlmIChkZXRlY3RlZC5wbGF0Zm9ybSA9PT0gJ3lvdXR1YmUnKSBkYXlTdGF0cy55b3V0dWJlICs9IDE7XG4gIGVsc2UgaWYgKGRldGVjdGVkLnBsYXRmb3JtID09PSAnaW5zdGFncmFtJykgZGF5U3RhdHMuaW5zdGFncmFtICs9IDE7XG4gIGVsc2UgaWYgKGRldGVjdGVkLnBsYXRmb3JtID09PSAndGlrdG9rJykgZGF5U3RhdHMudGlrdG9rICs9IDE7XG5cbiAgc3RhdGUuY3VycmVudFNlc3Npb24udG90YWwgKz0gMTtcbiAgaWYgKGRldGVjdGVkLnBsYXRmb3JtID09PSAneW91dHViZScpIHN0YXRlLmN1cnJlbnRTZXNzaW9uLnlvdXR1YmUgKz0gMTtcbiAgZWxzZSBpZiAoZGV0ZWN0ZWQucGxhdGZvcm0gPT09ICdpbnN0YWdyYW0nKSBzdGF0ZS5jdXJyZW50U2Vzc2lvbi5pbnN0YWdyYW0gKz0gMTtcbiAgZWxzZSBpZiAoZGV0ZWN0ZWQucGxhdGZvcm0gPT09ICd0aWt0b2snKSBzdGF0ZS5jdXJyZW50U2Vzc2lvbi50aWt0b2sgKz0gMTtcblxuICBzdGF0ZS5jdXJyZW50U2Vzc2lvbi5sYXN0Q29udGVudElkID0gZGV0ZWN0ZWQuY29udGVudElkO1xuICBzdGF0ZS5jdXJyZW50U2Vzc2lvbi5sYXN0QWN0aXZlVGltZXN0YW1wID0gbm93SXNvO1xuXG4gIGlmICghc2VlblRvZGF5LmluY2x1ZGVzKGRldGVjdGVkLmNvbnRlbnRJZCkpIHtcbiAgICBzZWVuVG9kYXkucHVzaChkZXRlY3RlZC5jb250ZW50SWQpO1xuICAgIHN0YXRlLnNlZW5Db250ZW50SWRzVG9kYXlbdG9kYXldID0gc2VlblRvZGF5O1xuICB9XG5cbiAgLy8gS2VlcCBsYXN0IDE1MCBldmVudHMgaW4gaGlzdG9yeVxuICBzdGF0ZS5ldmVudHMudW5zaGlmdCh7XG4gICAgaWQ6IGBldnRfJHtEYXRlLm5vdygpfWAsXG4gICAgcGxhdGZvcm06IGRldGVjdGVkLnBsYXRmb3JtLFxuICAgIGNvbnRlbnRUeXBlOiBkZXRlY3RlZC5jb250ZW50VHlwZSxcbiAgICBjb250ZW50SWQ6IGRldGVjdGVkLmNvbnRlbnRJZCxcbiAgICB0aW1lc3RhbXA6IG5vd0lzbyxcbiAgICBkYXRlOiB0b2RheSxcbiAgICB1cmw6IHVybCxcbiAgfSk7XG4gIGlmIChzdGF0ZS5ldmVudHMubGVuZ3RoID4gMTUwKSB7XG4gICAgc3RhdGUuZXZlbnRzID0gc3RhdGUuZXZlbnRzLnNsaWNlKDAsIDE1MCk7XG4gIH1cblxuICBhd2FpdCBzYXZlU3RvcmFnZURhdGEoc3RhdGUpO1xuICBhd2FpdCB1cGRhdGVCYWRnZSgpO1xuXG4gIC8vIENoZWNrIGFuZCBkaXNwYXRjaCBicmFpbnJvdCBub3RpZmljYXRpb25zIGF0IG1pbGVzdG9uZSBjb3VudHMgKDEwLCAyMCwgMzAuLi4gdXAgdG8gMTAwKVxuICBhd2FpdCBjaGVja0FuZFNlbmROb3RpZmljYXRpb24oZGF5U3RhdHMudG90YWwsIHN0YXRlLnNldHRpbmdzKTtcblxuICBsb2cuc3VjY2VzcyhgUmVjb3JkZWQgJHtkZXRlY3RlZC5wbGF0Zm9ybX0gJHtkZXRlY3RlZC5jb250ZW50VHlwZX0gWyR7ZGV0ZWN0ZWQuY29udGVudElkfV0uIFRvZGF5J3MgdG90YWw6ICR7ZGF5U3RhdHMudG90YWx9LCBTZXNzaW9uOiAke3N0YXRlLmN1cnJlbnRTZXNzaW9uLnRvdGFsfWApO1xuICByZXR1cm4geyByZWNvcmRlZDogdHJ1ZSwgaXNEdXBsaWNhdGU6IGZhbHNlIH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyA0LiBOYXZpZ2F0aW9uIERldGVjdGlvbiBQaXBlbGluZVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZU5hdmlnYXRpb24odXJsLCB0cmlnZ2VyKSB7XG4gIGlmICghdXJsIHx8IHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSByZXR1cm47XG4gIGNvbnN0IGRldGVjdGVkID0gZGV0ZWN0b3JzLmRldGVjdCh1cmwpO1xuICBpZiAoZGV0ZWN0ZWQuaXNTaG9ydEZvcm0gJiYgZGV0ZWN0ZWQuY29udGVudElkKSB7XG4gICAgbG9nLmluZm8oYE5hdmlnYXRpb24gZXZlbnQgWyR7dHJpZ2dlcn1dOiAke3VybH1gKTtcbiAgICBhd2FpdCByZWNvcmRDb250ZW50V2F0Y2goZGV0ZWN0ZWQsIHVybCk7XG4gIH1cbn1cblxuLy8gSG9vayBpbnRvIFNQQSBuYXZpZ2F0aW9uIChoaXN0b3J5IHN0YXRlIHB1c2gvcmVwbGFjZSlcbmlmIChjaHJvbWUud2ViTmF2aWdhdGlvbj8ub25IaXN0b3J5U3RhdGVVcGRhdGVkKSB7XG4gIGNocm9tZS53ZWJOYXZpZ2F0aW9uLm9uSGlzdG9yeVN0YXRlVXBkYXRlZC5hZGRMaXN0ZW5lcigoZGV0YWlscykgPT4ge1xuICAgIGlmIChkZXRhaWxzLmZyYW1lSWQgPT09IDAgJiYgZGV0YWlscy51cmwpIHtcbiAgICAgIGhhbmRsZU5hdmlnYXRpb24oZGV0YWlscy51cmwsICdvbkhpc3RvcnlTdGF0ZVVwZGF0ZWQnKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBIb29rIGludG8gaW5pdGlhbCBwYWdlIGxvYWQgLyBoYXJkIHJlbG9hZFxuaWYgKGNocm9tZS53ZWJOYXZpZ2F0aW9uPy5vbkNvbXBsZXRlZCkge1xuICBjaHJvbWUud2ViTmF2aWdhdGlvbi5vbkNvbXBsZXRlZC5hZGRMaXN0ZW5lcigoZGV0YWlscykgPT4ge1xuICAgIGlmIChkZXRhaWxzLmZyYW1lSWQgPT09IDAgJiYgZGV0YWlscy51cmwpIHtcbiAgICAgIGhhbmRsZU5hdmlnYXRpb24oZGV0YWlscy51cmwsICdvbkNvbXBsZXRlZCcpO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIEhvb2sgaW50byB0YWIgdXJsIGNoYW5nZXNcbmlmIChjaHJvbWUudGFicz8ub25VcGRhdGVkKSB7XG4gIGNocm9tZS50YWJzLm9uVXBkYXRlZC5hZGRMaXN0ZW5lcigoX3RhYklkLCBjaGFuZ2VJbmZvLCBfdGFiKSA9PiB7XG4gICAgaWYgKGNoYW5nZUluZm8udXJsKSB7XG4gICAgICBoYW5kbGVOYXZpZ2F0aW9uKGNoYW5nZUluZm8udXJsLCAndGFicy5vblVwZGF0ZWQnKTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gNS4gUG9wdXAgJiBSdW50aW1lIENvbW11bmljYXRpb25cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKG1lc3NhZ2UsIF9zZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xuICAoYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAobWVzc2FnZS50eXBlID09PSAnR0VUX1NUQVRTJykge1xuICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgZ2V0U3RvcmFnZURhdGEoKTtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YSB9KTtcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS50eXBlID09PSAnUkVTRVRfVE9EQVknKSB7XG4gICAgICAgIGNvbnN0IHN0YXRlID0gYXdhaXQgZ2V0U3RvcmFnZURhdGEoKTtcbiAgICAgICAgY29uc3QgdG9kYXkgPSBnZXRUb2RheVN0cmluZygpO1xuICAgICAgICBzdGF0ZS5kYWlseVN0YXRzW3RvZGF5XSA9IHsgdG90YWw6IDAsIHlvdXR1YmU6IDAsIGluc3RhZ3JhbTogMCwgdGlrdG9rOiAwIH07XG4gICAgICAgIHN0YXRlLnNlZW5Db250ZW50SWRzVG9kYXlbdG9kYXldID0gW107XG4gICAgICAgIHN0YXRlLmN1cnJlbnRTZXNzaW9uLnRvdGFsID0gMDtcbiAgICAgICAgc3RhdGUuY3VycmVudFNlc3Npb24ueW91dHViZSA9IDA7XG4gICAgICAgIHN0YXRlLmN1cnJlbnRTZXNzaW9uLmxhc3RDb250ZW50SWQgPSBudWxsO1xuICAgICAgICBhd2FpdCBzYXZlU3RvcmFnZURhdGEoc3RhdGUpO1xuICAgICAgICBhd2FpdCB1cGRhdGVCYWRnZSgpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBzdGF0ZSB9KTtcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS50eXBlID09PSAnVVBEQVRFX1NFVFRJTkdTJykge1xuICAgICAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IGdldFN0b3JhZ2VEYXRhKCk7XG4gICAgICAgIHN0YXRlLnNldHRpbmdzID0geyAuLi5zdGF0ZS5zZXR0aW5ncywgLi4ubWVzc2FnZS5wYXlsb2FkIH07XG4gICAgICAgIGF3YWl0IHNhdmVTdG9yYWdlRGF0YShzdGF0ZSk7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUsIHNldHRpbmdzOiBzdGF0ZS5zZXR0aW5ncyB9KTtcbiAgICAgIH0gZWxzZSBpZiAobWVzc2FnZS50eXBlID09PSAnU0lNVUxBVEVfTkFWSUdBVElPTicpIHtcbiAgICAgICAgaWYgKG1lc3NhZ2UudXJsKSB7XG4gICAgICAgICAgYXdhaXQgaGFuZGxlTmF2aWdhdGlvbihtZXNzYWdlLnVybCwgJ3BvcHVwX3NpbXVsYXRlJyk7XG4gICAgICAgICAgY29uc3Qgc3RhdGUgPSBhd2FpdCBnZXRTdG9yYWdlRGF0YSgpO1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHN0YXRlIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIFVSTCBwcm92aWRlZCcgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1Vua25vd24gbWVzc2FnZScgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2cuZXJyb3IoJ1J1bnRpbWUgbWVzc2FnZSBlcnJvcjonLCBlcnIpO1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9KTtcbiAgICB9XG4gIH0pKCk7XG4gIHJldHVybiB0cnVlO1xufSk7XG5cbi8vIEluaXRpYWxpemUgb24gaW5zdGFsbCBvciBzdGFydHVwXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4gIGxvZy5pbmZvKCdEb29taW5nIGEgRGF5IGV4dGVuc2lvbiBpbnN0YWxsZWQvc3RhcnRlZC4nKTtcbiAgdXBkYXRlQmFkZ2UoKTtcbn0pO1xuIl19