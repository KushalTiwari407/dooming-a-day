/**
* Dooming a Day - Popup Controller
* Communicates with background service worker and local storage
*/
function getTodayString() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
// DOM Elements
const todayTotalEl = document.getElementById("today-total");
const countYoutubeEl = document.getElementById("count-youtube");
const countInstagramEl = document.getElementById("count-instagram");
const countTiktokEl = document.getElementById("count-tiktok");
const sessionTotalEl = document.getElementById("session-total");
const brainrotRankEl = document.getElementById("brainrot-rank");
const btnReset = document.getElementById("btn-reset");
const btnTestShort = document.getElementById("btn-test-short");
const toggleNotifications = document.getElementById("toggle-notifications");
const toggleDedup = document.getElementById("toggle-dedup");
const statusTextEl = document.getElementById("status-text");
function getBrainrotRank(total) {
	if (total >= 100) return "👑 GOD-TIER BRAINROT DEITY";
	if (total >= 90) return "☣️ Biohazard Doomlord";
	if (total >= 80) return "🕳️ Void Dweller";
	if (total >= 70) return "⚡ Algorithm Puppet";
	if (total >= 60) return "🔥 Terminal Ohio Rizzler";
	if (total >= 50) return "💀 DEADLY BRAINROTTER";
	if (total >= 40) return "⚠️ Certified Glazer";
	if (total >= 30) return "🧟 Zombified Scroller";
	if (total >= 20) return "💀 Dopamine Bankrupt";
	if (total >= 10) return "🧠 Mildly Cooked";
	return "🌱 Clean Mind";
}
/**
* Updates UI with latest data
*/
function renderStats(data) {
	if (!data) return;
	const today = getTodayString();
	const todayStats = data.dailyStats?.[today] || {
		total: 0,
		youtube: 0,
		instagram: 0,
		tiktok: 0
	};
	const session = data.currentSession || {
		total: 0,
		youtube: 0,
		instagram: 0,
		tiktok: 0
	};
	const settings = data.settings || {};
	const total = todayStats.total || 0;
	todayTotalEl.textContent = String(total);
	countYoutubeEl.textContent = String(todayStats.youtube || 0);
	countInstagramEl.textContent = String(todayStats.instagram || 0);
	countTiktokEl.textContent = String(todayStats.tiktok || 0);
	sessionTotalEl.textContent = String(session.total || 0);
	if (brainrotRankEl) {
		brainrotRankEl.textContent = getBrainrotRank(total);
	}
	if (toggleNotifications) {
		toggleNotifications.checked = settings.notificationsEnabled ?? true;
	}
	if (toggleDedup) {
		toggleDedup.checked = settings.deduplicateByDay ?? true;
	}
}
/**
* Loads current stats from background worker or chrome.storage
*/
async function loadStats() {
	try {
		if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
			chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
				if (chrome.runtime.lastError) {
					console.warn("Could not contact background worker:", chrome.runtime.lastError.message);
					fallbackReadFromStorage();
					return;
				}
				if (response?.data) {
					renderStats(response.data);
				}
			});
		} else {
			fallbackReadFromStorage();
		}
	} catch (err) {
		console.error("Failed to load stats:", err);
	}
}
function fallbackReadFromStorage() {
	if (typeof chrome !== "undefined" && chrome.storage?.local) {
		chrome.storage.local.get("dooming_a_day_data", (result) => {
			if (result?.dooming_a_day_data) {
				renderStats(result.dooming_a_day_data);
			}
		});
	}
}
/**
* Detects if the current active tab is on YouTube Shorts
*/
async function checkActiveTab() {
	try {
		if (typeof chrome !== "undefined" && chrome.tabs?.query) {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});
			if (tab?.url) {
				if (tab.url.includes("youtube.com/shorts/")) {
					statusTextEl.textContent = "Active on YouTube Shorts 🟢";
					statusTextEl.style.color = "#4ade80";
				} else if (tab.url.includes("instagram.com/reel/") || tab.url.includes("instagram.com/reels/")) {
					statusTextEl.textContent = "Active on Instagram Reels 🟢";
					statusTextEl.style.color = "#4ade80";
				} else if (tab.url.includes("tiktok.com")) {
					statusTextEl.textContent = "Active on TikTok 🟢";
					statusTextEl.style.color = "#4ade80";
				} else if (tab.url.includes("youtube.com")) {
					statusTextEl.textContent = "On YouTube (standard)";
				} else if (tab.url.includes("instagram.com")) {
					statusTextEl.textContent = "On Instagram (feed/stories)";
				} else {
					statusTextEl.textContent = "Ready & listening for Doomscrolls";
				}
			}
		}
	} catch (err) {
		statusTextEl.textContent = "Listening for Shorts...";
	}
}
// -----------------------------------------------------------------------------
// Event Handlers
// -----------------------------------------------------------------------------
// Reset Today's Count
btnReset?.addEventListener("click", () => {
	const confirmed = confirm("Are you sure you want to reset today's doom count to 0?");
	if (!confirmed) return;
	if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
		chrome.runtime.sendMessage({ type: "RESET_TODAY" }, (response) => {
			if (response?.data) {
				renderStats(response.data);
			}
		});
	}
});
// Quick Test Button: Simulates detecting a new video across all platforms
let testCounter = 1;
btnTestShort?.addEventListener("click", () => {
	const rand = Math.random();
	const testId = `${Date.now().toString(36).slice(-4)}_${testCounter++}`;
	let mockUrl = `https://www.youtube.com/shorts/yt_${testId}`;
	if (rand < .33) {
		mockUrl = `https://www.youtube.com/shorts/yt_${testId}`;
	} else if (rand < .66) {
		mockUrl = `https://www.instagram.com/reel/ig_${testId}/`;
	} else {
		mockUrl = `https://www.tiktok.com/@user/video/7342${Date.now()}`;
	}
	if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
		chrome.runtime.sendMessage({
			type: "SIMULATE_NAVIGATION",
			url: mockUrl
		}, (response) => {
			if (response?.data) {
				renderStats(response.data);
			} else {
				loadStats();
			}
		});
	}
});
// Settings Toggles
toggleNotifications?.addEventListener("change", (e) => {
	const checked = e.target.checked;
	chrome.runtime?.sendMessage({
		type: "UPDATE_SETTINGS",
		payload: { notificationsEnabled: checked }
	});
});
toggleDedup?.addEventListener("change", (e) => {
	const checked = e.target.checked;
	chrome.runtime?.sendMessage({
		type: "UPDATE_SETTINGS",
		payload: { deduplicateByDay: checked }
	});
});
// Initial load
document.addEventListener("DOMContentLoaded", () => {
	loadStats();
	checkActiveTab();
});

//# sourceMappingURL=data:application/json;base64,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QixNQUFNO0VBQ04sU0FBUyxFQUFFLGtCQUFrQixRQUFRO0NBQ3ZDLENBQUM7QUFDSCxDQUFDOztBQUdELFNBQVMsaUJBQWlCLDBCQUEwQjtDQUNsRCxVQUFVO0NBQ1YsZUFBZTtBQUNqQixDQUFDIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbInBvcHVwLmpzIl0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogRG9vbWluZyBhIERheSAtIFBvcHVwIENvbnRyb2xsZXJcbiAqIENvbW11bmljYXRlcyB3aXRoIGJhY2tncm91bmQgc2VydmljZSB3b3JrZXIgYW5kIGxvY2FsIHN0b3JhZ2VcbiAqL1xuXG5mdW5jdGlvbiBnZXRUb2RheVN0cmluZygpIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHkgPSBkLmdldEZ1bGxZZWFyKCk7XG4gIGNvbnN0IG0gPSBTdHJpbmcoZC5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgY29uc3QgZGF5ID0gU3RyaW5nKGQuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCAnMCcpO1xuICByZXR1cm4gYCR7eX0tJHttfS0ke2R9YDtcbn1cblxuLy8gRE9NIEVsZW1lbnRzXG5jb25zdCB0b2RheVRvdGFsRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9kYXktdG90YWwnKTtcbmNvbnN0IGNvdW50WW91dHViZUVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdW50LXlvdXR1YmUnKTtcbmNvbnN0IGNvdW50SW5zdGFncmFtRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY291bnQtaW5zdGFncmFtJyk7XG5jb25zdCBjb3VudFRpa3Rva0VsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvdW50LXRpa3RvaycpO1xuY29uc3Qgc2Vzc2lvblRvdGFsRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2Vzc2lvbi10b3RhbCcpO1xuY29uc3QgYnJhaW5yb3RSYW5rRWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnJhaW5yb3QtcmFuaycpO1xuY29uc3QgYnRuUmVzZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXJlc2V0Jyk7XG5jb25zdCBidG5UZXN0U2hvcnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYnRuLXRlc3Qtc2hvcnQnKTtcbmNvbnN0IHRvZ2dsZU5vdGlmaWNhdGlvbnMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9nZ2xlLW5vdGlmaWNhdGlvbnMnKTtcbmNvbnN0IHRvZ2dsZURlZHVwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvZ2dsZS1kZWR1cCcpO1xuY29uc3Qgc3RhdHVzVGV4dEVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0YXR1cy10ZXh0Jyk7XG5cbmZ1bmN0aW9uIGdldEJyYWlucm90UmFuayh0b3RhbCkge1xuICBpZiAodG90YWwgPj0gMTAwKSByZXR1cm4gJ/CfkZEgR09ELVRJRVIgQlJBSU5ST1QgREVJVFknO1xuICBpZiAodG90YWwgPj0gOTApIHJldHVybiAn4pij77iPIEJpb2hhemFyZCBEb29tbG9yZCc7XG4gIGlmICh0b3RhbCA+PSA4MCkgcmV0dXJuICfwn5Wz77iPIFZvaWQgRHdlbGxlcic7XG4gIGlmICh0b3RhbCA+PSA3MCkgcmV0dXJuICfimqEgQWxnb3JpdGhtIFB1cHBldCc7XG4gIGlmICh0b3RhbCA+PSA2MCkgcmV0dXJuICfwn5SlIFRlcm1pbmFsIE9oaW8gUml6emxlcic7XG4gIGlmICh0b3RhbCA+PSA1MCkgcmV0dXJuICfwn5KAIERFQURMWSBCUkFJTlJPVFRFUic7XG4gIGlmICh0b3RhbCA+PSA0MCkgcmV0dXJuICfimqDvuI8gQ2VydGlmaWVkIEdsYXplcic7XG4gIGlmICh0b3RhbCA+PSAzMCkgcmV0dXJuICfwn6efIFpvbWJpZmllZCBTY3JvbGxlcic7XG4gIGlmICh0b3RhbCA+PSAyMCkgcmV0dXJuICfwn5KAIERvcGFtaW5lIEJhbmtydXB0JztcbiAgaWYgKHRvdGFsID49IDEwKSByZXR1cm4gJ/Cfp6AgTWlsZGx5IENvb2tlZCc7XG4gIHJldHVybiAn8J+MsSBDbGVhbiBNaW5kJztcbn1cblxuLyoqXG4gKiBVcGRhdGVzIFVJIHdpdGggbGF0ZXN0IGRhdGFcbiAqL1xuZnVuY3Rpb24gcmVuZGVyU3RhdHMoZGF0YSkge1xuICBpZiAoIWRhdGEpIHJldHVybjtcblxuICBjb25zdCB0b2RheSA9IGdldFRvZGF5U3RyaW5nKCk7XG4gIGNvbnN0IHRvZGF5U3RhdHMgPSBkYXRhLmRhaWx5U3RhdHM/Llt0b2RheV0gfHwge1xuICAgIHRvdGFsOiAwLFxuICAgIHlvdXR1YmU6IDAsXG4gICAgaW5zdGFncmFtOiAwLFxuICAgIHRpa3RvazogMCxcbiAgfTtcblxuICBjb25zdCBzZXNzaW9uID0gZGF0YS5jdXJyZW50U2Vzc2lvbiB8fCB7IHRvdGFsOiAwLCB5b3V0dWJlOiAwLCBpbnN0YWdyYW06IDAsIHRpa3RvazogMCB9O1xuICBjb25zdCBzZXR0aW5ncyA9IGRhdGEuc2V0dGluZ3MgfHwge307XG5cbiAgY29uc3QgdG90YWwgPSB0b2RheVN0YXRzLnRvdGFsIHx8IDA7XG4gIHRvZGF5VG90YWxFbC50ZXh0Q29udGVudCA9IFN0cmluZyh0b3RhbCk7XG4gIGNvdW50WW91dHViZUVsLnRleHRDb250ZW50ID0gU3RyaW5nKHRvZGF5U3RhdHMueW91dHViZSB8fCAwKTtcbiAgY291bnRJbnN0YWdyYW1FbC50ZXh0Q29udGVudCA9IFN0cmluZyh0b2RheVN0YXRzLmluc3RhZ3JhbSB8fCAwKTtcbiAgY291bnRUaWt0b2tFbC50ZXh0Q29udGVudCA9IFN0cmluZyh0b2RheVN0YXRzLnRpa3RvayB8fCAwKTtcbiAgc2Vzc2lvblRvdGFsRWwudGV4dENvbnRlbnQgPSBTdHJpbmcoc2Vzc2lvbi50b3RhbCB8fCAwKTtcblxuICBpZiAoYnJhaW5yb3RSYW5rRWwpIHtcbiAgICBicmFpbnJvdFJhbmtFbC50ZXh0Q29udGVudCA9IGdldEJyYWlucm90UmFuayh0b3RhbCk7XG4gIH1cblxuICBpZiAodG9nZ2xlTm90aWZpY2F0aW9ucykge1xuICAgIHRvZ2dsZU5vdGlmaWNhdGlvbnMuY2hlY2tlZCA9IHNldHRpbmdzLm5vdGlmaWNhdGlvbnNFbmFibGVkID8/IHRydWU7XG4gIH1cbiAgaWYgKHRvZ2dsZURlZHVwKSB7XG4gICAgdG9nZ2xlRGVkdXAuY2hlY2tlZCA9IHNldHRpbmdzLmRlZHVwbGljYXRlQnlEYXkgPz8gdHJ1ZTtcbiAgfVxufVxuXG4vKipcbiAqIExvYWRzIGN1cnJlbnQgc3RhdHMgZnJvbSBiYWNrZ3JvdW5kIHdvcmtlciBvciBjaHJvbWUuc3RvcmFnZVxuICovXG5hc3luYyBmdW5jdGlvbiBsb2FkU3RhdHMoKSB7XG4gIHRyeSB7XG4gICAgaWYgKHR5cGVvZiBjaHJvbWUgIT09ICd1bmRlZmluZWQnICYmIGNocm9tZS5ydW50aW1lICYmIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKSB7XG4gICAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdHRVRfU1RBVFMnIH0sIChyZXNwb25zZSkgPT4ge1xuICAgICAgICBpZiAoY2hyb21lLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKCdDb3VsZCBub3QgY29udGFjdCBiYWNrZ3JvdW5kIHdvcmtlcjonLCBjaHJvbWUucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSk7XG4gICAgICAgICAgZmFsbGJhY2tSZWFkRnJvbVN0b3JhZ2UoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3BvbnNlPy5kYXRhKSB7XG4gICAgICAgICAgcmVuZGVyU3RhdHMocmVzcG9uc2UuZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmYWxsYmFja1JlYWRGcm9tU3RvcmFnZSgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgc3RhdHM6JywgZXJyKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWxsYmFja1JlYWRGcm9tU3RvcmFnZSgpIHtcbiAgaWYgKHR5cGVvZiBjaHJvbWUgIT09ICd1bmRlZmluZWQnICYmIGNocm9tZS5zdG9yYWdlPy5sb2NhbCkge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldCgnZG9vbWluZ19hX2RheV9kYXRhJywgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdD8uZG9vbWluZ19hX2RheV9kYXRhKSB7XG4gICAgICAgIHJlbmRlclN0YXRzKHJlc3VsdC5kb29taW5nX2FfZGF5X2RhdGEpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICogRGV0ZWN0cyBpZiB0aGUgY3VycmVudCBhY3RpdmUgdGFiIGlzIG9uIFlvdVR1YmUgU2hvcnRzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrQWN0aXZlVGFiKCkge1xuICB0cnkge1xuICAgIGlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiBjaHJvbWUudGFicz8ucXVlcnkpIHtcbiAgICAgIGNvbnN0IFt0YWJdID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyBhY3RpdmU6IHRydWUsIGN1cnJlbnRXaW5kb3c6IHRydWUgfSk7XG4gICAgICBpZiAodGFiPy51cmwpIHtcbiAgICAgICAgaWYgKHRhYi51cmwuaW5jbHVkZXMoJ3lvdXR1YmUuY29tL3Nob3J0cy8nKSkge1xuICAgICAgICAgIHN0YXR1c1RleHRFbC50ZXh0Q29udGVudCA9ICdBY3RpdmUgb24gWW91VHViZSBTaG9ydHMg8J+foic7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnN0eWxlLmNvbG9yID0gJyM0YWRlODAnO1xuICAgICAgICB9IGVsc2UgaWYgKHRhYi51cmwuaW5jbHVkZXMoJ2luc3RhZ3JhbS5jb20vcmVlbC8nKSB8fCB0YWIudXJsLmluY2x1ZGVzKCdpbnN0YWdyYW0uY29tL3JlZWxzLycpKSB7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnRleHRDb250ZW50ID0gJ0FjdGl2ZSBvbiBJbnN0YWdyYW0gUmVlbHMg8J+foic7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnN0eWxlLmNvbG9yID0gJyM0YWRlODAnO1xuICAgICAgICB9IGVsc2UgaWYgKHRhYi51cmwuaW5jbHVkZXMoJ3Rpa3Rvay5jb20nKSkge1xuICAgICAgICAgIHN0YXR1c1RleHRFbC50ZXh0Q29udGVudCA9ICdBY3RpdmUgb24gVGlrVG9rIPCfn6InO1xuICAgICAgICAgIHN0YXR1c1RleHRFbC5zdHlsZS5jb2xvciA9ICcjNGFkZTgwJztcbiAgICAgICAgfSBlbHNlIGlmICh0YWIudXJsLmluY2x1ZGVzKCd5b3V0dWJlLmNvbScpKSB7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnRleHRDb250ZW50ID0gJ09uIFlvdVR1YmUgKHN0YW5kYXJkKSc7XG4gICAgICAgIH0gZWxzZSBpZiAodGFiLnVybC5pbmNsdWRlcygnaW5zdGFncmFtLmNvbScpKSB7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnRleHRDb250ZW50ID0gJ09uIEluc3RhZ3JhbSAoZmVlZC9zdG9yaWVzKSc7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdHVzVGV4dEVsLnRleHRDb250ZW50ID0gJ1JlYWR5ICYgbGlzdGVuaW5nIGZvciBEb29tc2Nyb2xscyc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHN0YXR1c1RleHRFbC50ZXh0Q29udGVudCA9ICdMaXN0ZW5pbmcgZm9yIFNob3J0cy4uLic7XG4gIH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEV2ZW50IEhhbmRsZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vLyBSZXNldCBUb2RheSdzIENvdW50XG5idG5SZXNldD8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gIGNvbnN0IGNvbmZpcm1lZCA9IGNvbmZpcm0oXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcmVzZXQgdG9kYXkncyBkb29tIGNvdW50IHRvIDA/XCIpO1xuICBpZiAoIWNvbmZpcm1lZCkgcmV0dXJuO1xuXG4gIGlmICh0eXBlb2YgY2hyb21lICE9PSAndW5kZWZpbmVkJyAmJiBjaHJvbWUucnVudGltZT8uc2VuZE1lc3NhZ2UpIHtcbiAgICBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IHR5cGU6ICdSRVNFVF9UT0RBWScgfSwgKHJlc3BvbnNlKSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2U/LmRhdGEpIHtcbiAgICAgICAgcmVuZGVyU3RhdHMocmVzcG9uc2UuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBRdWljayBUZXN0IEJ1dHRvbjogU2ltdWxhdGVzIGRldGVjdGluZyBhIG5ldyB2aWRlbyBhY3Jvc3MgYWxsIHBsYXRmb3Jtc1xubGV0IHRlc3RDb3VudGVyID0gMTtcbmJ0blRlc3RTaG9ydD8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gIGNvbnN0IHJhbmQgPSBNYXRoLnJhbmRvbSgpO1xuICBjb25zdCB0ZXN0SWQgPSBgJHtEYXRlLm5vdygpLnRvU3RyaW5nKDM2KS5zbGljZSgtNCl9XyR7dGVzdENvdW50ZXIrK31gO1xuICBsZXQgbW9ja1VybCA9IGBodHRwczovL3d3dy55b3V0dWJlLmNvbS9zaG9ydHMveXRfJHt0ZXN0SWR9YDtcbiAgaWYgKHJhbmQgPCAwLjMzKSB7XG4gICAgbW9ja1VybCA9IGBodHRwczovL3d3dy55b3V0dWJlLmNvbS9zaG9ydHMveXRfJHt0ZXN0SWR9YDtcbiAgfSBlbHNlIGlmIChyYW5kIDwgMC42Nikge1xuICAgIG1vY2tVcmwgPSBgaHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS9yZWVsL2lnXyR7dGVzdElkfS9gO1xuICB9IGVsc2Uge1xuICAgIG1vY2tVcmwgPSBgaHR0cHM6Ly93d3cudGlrdG9rLmNvbS9AdXNlci92aWRlby83MzQyJHtEYXRlLm5vdygpfWA7XG4gIH1cblxuICBpZiAodHlwZW9mIGNocm9tZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY2hyb21lLnJ1bnRpbWU/LnNlbmRNZXNzYWdlKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoXG4gICAgICB7IHR5cGU6ICdTSU1VTEFURV9OQVZJR0FUSU9OJywgdXJsOiBtb2NrVXJsIH0sXG4gICAgICAocmVzcG9uc2UpID0+IHtcbiAgICAgICAgaWYgKHJlc3BvbnNlPy5kYXRhKSB7XG4gICAgICAgICAgcmVuZGVyU3RhdHMocmVzcG9uc2UuZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9hZFN0YXRzKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG59KTtcblxuLy8gU2V0dGluZ3MgVG9nZ2xlc1xudG9nZ2xlTm90aWZpY2F0aW9ucz8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgY29uc3QgY2hlY2tlZCA9IGUudGFyZ2V0LmNoZWNrZWQ7XG4gIGNocm9tZS5ydW50aW1lPy5zZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogJ1VQREFURV9TRVRUSU5HUycsXG4gICAgcGF5bG9hZDogeyBub3RpZmljYXRpb25zRW5hYmxlZDogY2hlY2tlZCB9LFxuICB9KTtcbn0pO1xuXG50b2dnbGVEZWR1cD8uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKGUpID0+IHtcbiAgY29uc3QgY2hlY2tlZCA9IGUudGFyZ2V0LmNoZWNrZWQ7XG4gIGNocm9tZS5ydW50aW1lPy5zZW5kTWVzc2FnZSh7XG4gICAgdHlwZTogJ1VQREFURV9TRVRUSU5HUycsXG4gICAgcGF5bG9hZDogeyBkZWR1cGxpY2F0ZUJ5RGF5OiBjaGVja2VkIH0sXG4gIH0pO1xufSk7XG5cbi8vIEluaXRpYWwgbG9hZFxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgbG9hZFN0YXRzKCk7XG4gIGNoZWNrQWN0aXZlVGFiKCk7XG59KTtcbiJdfQ==