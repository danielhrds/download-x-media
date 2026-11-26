const activeRequests = new Set();

chrome.action.onClicked.addListener((tab) => {
  downloadPost(tab).catch(console.error);
});

function parsePost(tabUrl) {
  const url = URL.canParse(tabUrl) ? new URL(tabUrl) : null;
  const isTwitter = url?.protocol === "https:" &&
    /^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/.test(url.hostname);
  if (!isTwitter) return null;

  const match = url.pathname.match(/^\/(i\/web|[\w]+)\/status\/(\d{2,20})(?:\/video\/([1-9]\d*)|\/photo\/[1-9]\d*)?\/?$/);
  if (!match) return null;

  const [, account, id, videoNumber] = match;
  const accountPath = account === "i/web" ? "i" : account;
  const videoPath = videoNumber ? `/video/${videoNumber}` : "";

  return {
    id,
    videoNumber: videoNumber ? Number(videoNumber) : null,
    fallbackUrl: `https://d.fxtwitter.com/${accountPath}/status/${id}${videoPath}`
  };
}

async function findVideo({ id, videoNumber }) {
  const response = await fetch(`https://api.fxtwitter.com/2/status/${id}`, {
    credentials: "omit",
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) return null;

  const { status } = await response.json();
  const media = status?.media;
  const video = videoNumber
    ? (media?.all ?? media?.videos)?.[videoNumber - 1]
    : media?.videos?.[0];
  const url = URL.canParse(video?.url) ? new URL(video.url) : null;
  if (url?.origin === "https://video.twimg.com" && /\.mp4$/i.test(url.pathname)) {
    return url.href;
  }
  return null;
}

async function downloadPost(tab) {
  const tabId = tab.id;
  if (tabId == null || activeRequests.has(tabId)) return;

  const post = parsePost(tab.url);
  if (!post) return;

  activeRequests.add(tabId);
  try {
    try {
      const url = await findVideo(post);
      if (url) {
        await chrome.downloads.download({
          url,
          filename: `x-${post.id}${post.videoNumber > 1 ? `-${post.videoNumber}` : ""}.mp4`,
          conflictAction: "uniquify"
        });
        return;
      }
    } catch (error) {
      console.debug("Download direto indisponível.", error);
    }

    await chrome.tabs.create({ url: post.fallbackUrl, windowId: tab.windowId });
  } finally {
    activeRequests.delete(tabId);
  }
}
