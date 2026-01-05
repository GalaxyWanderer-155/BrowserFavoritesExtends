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
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log('书签已创建:', bookmark);
  notifyBookmarkChange('BOOKMARK_CREATED', { bookmark: bookmark });
  
  // 保存书签信息并在扩展图标上显示提示
  if (bookmark.url) {
    try {
      // 获取当前活动标签页的信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // 存储书签信息供 popup 使用
      await chrome.storage.local.set({
        lastBookmarked: {
          id: id,
          title: bookmark.title,
          url: bookmark.url,
          dateAdded: bookmark.dateAdded,
          tabTitle: tab?.title || bookmark.title,
          tabUrl: tab?.url || bookmark.url,
          hasNewBookmark: true
        }
      });

      // 在扩展图标上显示提示徽章
      chrome.action.setBadgeText({ text: '新' });
      chrome.action.setBadgeBackgroundColor({ color: '#333' });
    } catch (error) {
      console.error('处理收藏事件失败:', error);
    }
  }
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

