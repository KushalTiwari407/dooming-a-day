# dooming-a-day
A local-first browser extension that tracks short-form video consumption on desktop, counts videos watched, and sends notifications every 10 videos. locally and give notifcation in each 10 short video watched.  

<img width="440" height="685" alt="Screenshot 2026-09-24 223215" src="https://github.com/user-attachments/assets/802fb901-06b2-4ad3-b511-bf78ff2ea816" />

How to Install & Test the Extension in Google Chrome
Follow these step-by-step instructions to load the unpacked extension in Chrome Developer Mode.

Step 1: Download or locate the extension files
Click the Download Extension (.zip) button at the top right of this page and extract the ZIP to a folder, OR use the extension/ folder in this project repository.

Step 2: Open Chrome Extensions Page
Open Google Chrome and navigate to chrome://extensions in the address bar.

Step 3: Enable Developer Mode
In the top right corner of the chrome://extensions page, toggle the switch labeled Developer mode to ON.

Step 4: Load the Unpacked Extension
Click the Load unpacked button that appears in the top left. In the file picker, select the extension folder (the folder containing manifest.json).

Step 5: Verify & Pin to Toolbar
You will see Dooming a Day - Doomscroll Tracker in your list of extensions. Click the puzzle icon in Chrome's toolbar and pin Dooming a Day so you can see the counter badge!

Step 6: Test on YouTube Shorts & Instagram Reels
Open https://www.youtube.com/shorts/ or https://www.instagram.com/reels/. Scroll through a few Shorts and Reels. Click the extension icon in your Chrome toolbar to verify the count increments for each unique short/reel!

Step 7: Inspect Service Worker Console (Debugging)
On chrome://extensions, find Dooming a Day and click the blue link labeled service worker. This opens Chrome DevTools for the background service worker where you can see all live detection logs:
[Dooming a Day] ✅ Recorded instagram reel [C1aBcDeFgHi]. Today's total: 2


<img width="512" height="198" alt="Screenshot 2026-09-24 223340" src="https://github.com/user-attachments/assets/1dfbb04b-feee-465f-9831-956423c8204d" />


🔒 Permissions Justification (Minimal & Scoped)
• storage: Saves daily counts and session history in chrome.storage.local.
• webNavigation: Listens for SPA pushState changes when you scroll between Shorts or Reels.
• tabs: Checks whether your active tab is currently watching Shorts or Reels.
• *://*.youtube.com/* & *://*.instagram.com/* (host permissions): Scopes all navigation listening strictly to supported video platforms.

!!!!BUGS ARE EXPECTED AS IT IS FIRST RELEASED VERSION!!!!
REPORT BUGS
