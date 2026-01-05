// 使用 storage 来通知书签变化
async function notifyBookmarkChange(type, data) {
  try {
    const timestamp = Date.now();
    await chrome.storage.local.set({
      bookmarkChange: {
        type: type,
        data: data,
        timestamp: timestamp
      }
    });
  } catch (error) {
    console.error('通知书签变化失败:', error);
  }
}

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  console.log('书签已创建:', bookmark);
  notifyBookmarkChange('BOOKMARK_CREATED', { bookmark: bookmark });
});

// 监听书签删除事件
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  console.log('书签已删除:', id);
  notifyBookmarkChange('BOOKMARK_REMOVED', { id: id });
});

// 监听书签更改事件
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  console.log('书签已更改:', id, changeInfo);
  notifyBookmarkChange('BOOKMARK_CHANGED', { id: id, changeInfo: changeInfo });
});

// 监听书签移动事件
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  console.log('书签已移动:', id, moveInfo);
  notifyBookmarkChange('BOOKMARK_MOVED', { id: id, moveInfo: moveInfo });
});

console.log('书签监听服务已启动');

