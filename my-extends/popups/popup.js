// 加载并显示收藏的书签信息
async function loadBookmarkInfo() {
  const bookmarkContent = document.getElementById('bookmarkContent');
  
  try {
    // 从 storage 获取最后收藏的书签信息
    const result = await chrome.storage.local.get('lastBookmarked');
    const bookmark = result.lastBookmarked;

    // 清除徽章提示
    chrome.action.setBadgeText({ text: '' });

    if (!bookmark) {
      bookmarkContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">暂无收藏信息</div>
        </div>
      `;
      return;
    }

    // 如果有新的收藏，标记为已查看
    if (bookmark.hasNewBookmark) {
      bookmark.hasNewBookmark = false;
      await chrome.storage.local.set({ lastBookmarked: bookmark });
    }

    // 提取域名
    let domain = '';
    try {
      const urlObj = new URL(bookmark.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = bookmark.url;
    }

    // 格式化日期
    const date = new Date(bookmark.dateAdded || Date.now());
    const dateStr = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    bookmarkContent.innerHTML = `
      <div class="bookmark-title">${escapeHtml(bookmark.title || '无标题')}</div>
      <div class="bookmark-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(domain)}</div>
      
      <div class="bookmark-actions">
        <button class="action-btn primary" id="openBtn">打开网站</button>
        <button class="action-btn" id="copyBtn">复制链接</button>
      </div>
      
      <div class="bookmark-meta">
        收藏时间：${dateStr}
      </div>
    `;

    // 添加按钮事件
    const openBtn = document.getElementById('openBtn');
    const copyBtn = document.getElementById('copyBtn');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: bookmark.url });
        window.close();
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(bookmark.url);
          showNotification('链接已复制');
        } catch (error) {
          // 降级方案
          const textArea = document.createElement('textarea');
          textArea.value = bookmark.url;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          showNotification('链接已复制');
        }
      });
    }

  } catch (error) {
    console.error('加载书签信息失败:', error);
    bookmarkContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">加载失败</div>
      </div>
    `;
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示通知
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}


// 页面加载时加载书签信息
document.addEventListener('DOMContentLoaded', () => {
  loadBookmarkInfo();
});

