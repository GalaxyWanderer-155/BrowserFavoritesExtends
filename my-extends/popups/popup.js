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

    // 获取当前标签
    const currentTags = await getBookmarkTags(bookmark.id);
    const tagsHtml = currentTags.length > 0 
      ? `<div class="bookmark-tags">
          ${currentTags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
         </div>`
      : '';

    bookmarkContent.innerHTML = `
      <div class="bookmark-title">${escapeHtml(bookmark.title || '无标题')}</div>
      <div class="bookmark-url-container">
        <div class="bookmark-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(domain)}</div>
        <button class="copy-url-btn" id="copyUrlBtn" title="复制网址">📋</button>
      </div>
      
      <div class="bookmark-tags-section">
        <div class="bookmark-tags-label">标签：</div>
        ${tagsHtml || '<div class="bookmark-tags-empty">暂无标签</div>'}
        <div class="bookmark-tags-actions">
          <button class="action-btn-link" id="editTagsBtn">编辑标签</button>
          <button class="action-btn-link" id="generateTagsBtn">智能生成标签</button>
        </div>
      </div>
      
      <!-- 智能标签生成区域 -->
      <div id="smartTagsArea" class="smart-tags-area" style="display: none;">
        <div id="smartTagsLoading" class="smart-tags-loading" style="display: none;">
          <div class="loading-spinner-small"></div>
          <span>正在分析页面内容...</span>
        </div>
        <div id="smartTagsResult" class="smart-tags-result" style="display: none;">
          <div class="smart-tags-result-label">生成的标签建议：</div>
          <div id="smartTagsSuggestions" class="smart-tags-suggestions"></div>
          <div class="smart-tags-result-actions">
            <button class="btn-smart-tags" id="acceptAllTagsBtn">全部添加</button>
            <button class="btn-smart-tags-secondary" id="cancelSmartTagsBtn">取消</button>
          </div>
        </div>
        <div id="smartTagsError" class="smart-tags-error" style="display: none;"></div>
      </div>
      
      <div class="bookmark-meta">
        收藏时间：${dateStr}
      </div>
    `;

    // 复制网址按钮
    const copyUrlBtn = document.getElementById('copyUrlBtn');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', async () => {
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

    // 编辑标签按钮
    const editTagsBtn = document.getElementById('editTagsBtn');
    if (editTagsBtn) {
      editTagsBtn.addEventListener('click', () => {
        startEditTags(bookmark.id);
      });
    }

    // 智能生成标签按钮
    const generateTagsBtn = document.getElementById('generateTagsBtn');
    if (generateTagsBtn) {
      generateTagsBtn.addEventListener('click', () => {
        generateSmartTags(bookmark.id, bookmark);
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


// 获取书签标签
async function getBookmarkTags(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    console.error('获取书签标签失败:', error);
    return [];
  }
}

// 保存书签标签
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    if (tags.length > 0) {
      bookmarkTags[bookmarkId] = tags;
    } else {
      delete bookmarkTags[bookmarkId]; // 如果没有标签，则删除该书签的标签记录
    }
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

// 解析标签输入文本（格式：#tag1 #tag2 #tag3）
function parseTags(inputText) {
  if (!inputText || !inputText.trim()) {
    return [];
  }
  
  // 按空格分割
  const parts = inputText.trim().split(/\s+/);
  const tags = [];
  
  for (const part of parts) {
    // 移除#号（如果有）
    let tag = part.trim();
    if (tag.startsWith('#')) {
      tag = tag.substring(1);
    }
    
    // 如果tag不为空且不包含空格，则添加
    if (tag && !tag.includes(' ')) {
      tags.push(tag);
    }
  }
  
  // 去重
  return [...new Set(tags)];
}

// 格式化标签为显示文本（#tag1 #tag2 #tag3）
function formatTags(tags) {
  return tags.map(tag => `#${tag}`).join(' ');
}

// 开始编辑标签
async function startEditTags(bookmarkId) {
  const dialog = document.getElementById('tagsEditDialog');
  const input = document.getElementById('tagsEditInput');
  const preview = document.getElementById('tagsEditPreview');
  const closeBtn = dialog.querySelector('.tags-edit-close');
  const cancelBtn = dialog.querySelector('.tags-edit-btn.cancel');
  const saveBtn = dialog.querySelector('.tags-edit-btn.save');
  const overlay = dialog.querySelector('.tags-edit-overlay');

  if (!dialog || !input || !preview) return;

  // 获取当前标签
  const currentTags = await getBookmarkTags(bookmarkId);
  const currentTagsText = formatTags(currentTags);
  input.value = currentTagsText;

  // 更新预览
  function updatePreview() {
    const tags = parseTags(input.value);
    if (tags.length > 0) {
      preview.innerHTML = `
        <div class="tags-preview-label">预览：</div>
        <div class="tags-preview-tags">
          ${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    } else {
      preview.innerHTML = '<div class="tags-preview-empty">暂无标签</div>';
    }
  }

  // 初始预览
  updatePreview();

  // 输入时更新预览
  input.oninput = updatePreview;

  // 显示对话框
  dialog.style.display = 'flex';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);

  // 关闭对话框
  function closeDialog() {
    dialog.style.display = 'none';
    input.oninput = null;
  }

  closeBtn.onclick = closeDialog;
  cancelBtn.onclick = closeDialog;
  overlay.onclick = closeDialog;

  // 保存标签
  saveBtn.onclick = async () => {
    const tags = parseTags(input.value);
    try {
      await saveBookmarkTags(bookmarkId, tags);
      closeDialog();
      showNotification('标签已保存');
      loadBookmarkInfo(); // 重新加载以更新显示
    } catch (error) {
      console.error('保存标签失败:', error);
      showNotification('保存失败');
    }
  };

  // ESC键关闭，Ctrl+Enter保存
  input.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveBtn.click();
    }
  };
}

// 生成智能标签
async function generateSmartTags(bookmarkId, bookmark) {
  const smartTagsArea = document.getElementById('smartTagsArea');
  const smartTagsLoading = document.getElementById('smartTagsLoading');
  const smartTagsResult = document.getElementById('smartTagsResult');
  const smartTagsError = document.getElementById('smartTagsError');
  const generateTagsBtn = document.getElementById('generateTagsBtn');

  if (!smartTagsArea || !smartTagsLoading || !smartTagsResult || !smartTagsError) {
    console.error('智能标签生成区域元素未找到');
    return;
  }

  try {
    // 显示生成区域和加载状态
    smartTagsArea.style.display = 'block';
    smartTagsLoading.style.display = 'flex';
    smartTagsResult.style.display = 'none';
    smartTagsError.style.display = 'none';
    
    if (generateTagsBtn) {
      generateTagsBtn.disabled = true;
      generateTagsBtn.textContent = '生成中...';
    }

    // 检查API配置
    const configResult = await chrome.storage.local.get('aiApiConfig');
    const apiConfig = configResult.aiApiConfig;

    if (!apiConfig || !apiConfig.enabled) {
      throw new Error('智能标签功能未启用，请在设置中配置API');
    }

    // 获取当前活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error('无法获取当前标签页');
    }

    const activeTab = tabs[0];

    // 检查URL是否匹配
    if (activeTab.url !== bookmark.url) {
      // 尝试查找匹配的标签页
      const allTabs = await chrome.tabs.query({ url: bookmark.url });
      if (allTabs.length === 0) {
        throw new Error('无法找到匹配的标签页，请确保该页面已打开');
      }
    }

    // 发送消息到 background 生成标签
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GENERATE_SMART_TAGS',
        bookmarkId: bookmarkId,
        bookmark: bookmark,
        tabId: activeTab.id
      });

      if (response && response.success) {
        // 显示生成的标签建议
        displaySmartTagsSuggestions(response.tags, response.newTags || [], bookmarkId);
      } else {
        throw new Error(response?.error || '生成标签失败');
      }
    } catch (msgError) {
      // 如果消息传递失败，使用降级方案（仅使用标题和URL）
      console.warn('消息传递失败，使用降级方案:', msgError);
      await generateSmartTagsFallback(bookmarkId, bookmark, apiConfig);
    }

  } catch (error) {
    console.error('生成智能标签失败:', error);
    
    // 显示错误信息
    smartTagsLoading.style.display = 'none';
    smartTagsError.style.display = 'block';
    smartTagsError.textContent = error.message || '生成标签失败，请稍后重试';
    smartTagsError.className = 'smart-tags-error';
  } finally {
    if (generateTagsBtn) {
      generateTagsBtn.disabled = false;
      generateTagsBtn.textContent = '智能生成标签';
    }
  }
}

// 降级方案：仅使用标题和URL生成标签
async function generateSmartTagsFallback(bookmarkId, bookmark, apiConfig) {
  const smartTagsLoading = document.getElementById('smartTagsLoading');
  const smartTagsError = document.getElementById('smartTagsError');
  
  if (smartTagsLoading) smartTagsLoading.style.display = 'none';
  if (smartTagsError) {
    smartTagsError.style.display = 'block';
    smartTagsError.textContent = '页面内容提取失败，已使用简化方案生成标签';
    smartTagsError.className = 'smart-tags-error info';
  }
  
  // 重新加载标签显示
  setTimeout(() => {
    loadBookmarkInfo();
  }, 1000);
}

// 显示智能标签建议
function displaySmartTagsSuggestions(allTags, newTags, bookmarkId) {
  const smartTagsLoading = document.getElementById('smartTagsLoading');
  const smartTagsResult = document.getElementById('smartTagsResult');
  const smartTagsSuggestions = document.getElementById('smartTagsSuggestions');

  if (!smartTagsResult || !smartTagsSuggestions) return;

  // 隐藏加载状态
  if (smartTagsLoading) smartTagsLoading.style.display = 'none';

  // 显示结果
  smartTagsResult.style.display = 'block';

  // 显示新生成的标签（可选择性添加）
  if (newTags && newTags.length > 0) {
    smartTagsSuggestions.innerHTML = newTags.map(tag => `
      <span class="smart-tag-suggestion" data-tag="${escapeHtml(tag)}">
        <span class="smart-tag-text">${escapeHtml(tag)}</span>
        <button class="smart-tag-add" data-tag="${escapeHtml(tag)}" title="添加">+</button>
      </span>
    `).join('');

    // 绑定添加标签事件
    const addButtons = smartTagsSuggestions.querySelectorAll('.smart-tag-add');
    addButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const tag = btn.getAttribute('data-tag');
        await addSmartTag(bookmarkId, tag);
        // 移除该标签建议
        btn.closest('.smart-tag-suggestion').remove();
        // 如果所有标签都添加完了，隐藏结果区域
        if (smartTagsSuggestions.children.length === 0) {
          document.getElementById('smartTagsArea').style.display = 'none';
          loadBookmarkInfo(); // 重新加载显示
        }
      });
    });

    // 全部添加按钮
    const acceptAllBtn = document.getElementById('acceptAllTagsBtn');
    if (acceptAllBtn) {
      acceptAllBtn.onclick = async () => {
        const currentTags = await getBookmarkTags(bookmarkId);
        const allTags = [...new Set([...currentTags, ...newTags])];
        await saveBookmarkTags(bookmarkId, allTags);
        document.getElementById('smartTagsArea').style.display = 'none';
        showNotification('标签已全部添加');
        loadBookmarkInfo();
      };
    }

    // 取消按钮
    const cancelBtn = document.getElementById('cancelSmartTagsBtn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        document.getElementById('smartTagsArea').style.display = 'none';
      };
    }
  } else {
    smartTagsSuggestions.innerHTML = '<div class="smart-tags-no-suggestions">未生成新的标签建议</div>';
  }
}

// 添加单个智能标签
async function addSmartTag(bookmarkId, tag) {
  try {
    const currentTags = await getBookmarkTags(bookmarkId);
    if (!currentTags.includes(tag)) {
      const newTags = [...currentTags, tag];
      await saveBookmarkTags(bookmarkId, newTags);
      showNotification('标签已添加');
      loadBookmarkInfo();
    }
  } catch (error) {
    console.error('添加标签失败:', error);
    showNotification('添加失败');
  }
}

// 页面加载时加载书签信息
document.addEventListener('DOMContentLoaded', () => {
  loadBookmarkInfo();
});

