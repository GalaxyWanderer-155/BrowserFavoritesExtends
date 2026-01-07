// 存储所有书签的数组
let allBookmarks = [];
let filteredBookmarks = [];

// DOM 元素
const loadingEl = document.getElementById('loading');
const bookmarksListEl = document.getElementById('bookmarksList');
const emptyStateEl = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const totalCountEl = document.getElementById('totalCount');

// 获取文件夹路径的辅助函数
function getFolderPath(bookmark, bookmarkTree) {
  if (!bookmark.parentId || bookmark.parentId === '0') {
    return '根目录';
  }

  function findParent(id, tree, path = []) {
    for (const node of tree) {
      if (node.id === id) {
        return path;
      }
      if (node.children) {
        const found = findParent(id, node.children, [...path, node.title]);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  }

  const path = findParent(bookmark.parentId, bookmarkTree);
  return path ? path.join(' / ') : '未知文件夹';
}

// 获取书签的tag列表
async function getBookmarkTags(bookmarkId) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    return bookmarkTags[bookmarkId] || [];
  } catch (error) {
    console.error('获取书签tag失败:', error);
    return [];
  }
}

// 获取所有书签的tag（批量）
async function getAllBookmarkTags() {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    return result.bookmarkTags || {};
  } catch (error) {
    console.error('获取所有书签tag失败:', error);
    return {};
  }
}

// 递归提取所有书签
async function extractBookmarks(nodes, bookmarkTree, bookmarks = []) {
  // 先获取所有tag
  const allTags = await getAllBookmarkTags();
  
  for (const node of nodes) {
    if (node.url) {
      // 这是一个书签
      const bookmarkTags = allTags[node.id] || [];
      bookmarks.push({
        id: node.id,
        title: node.title || '无标题',
        url: node.url,
        folder: getFolderPath(node, bookmarkTree),
        tags: bookmarkTags
      });
    }
    if (node.children) {
      // 这是一个文件夹，递归处理
      await extractBookmarks(node.children, bookmarkTree, bookmarks);
    }
  }
  return bookmarks;
}

// 加载所有书签
async function loadBookmarks() {
  try {
    loadingEl.style.display = 'block';
    bookmarksListEl.style.display = 'none';
    emptyStateEl.style.display = 'none';

    // 获取书签树
    const bookmarkTree = await chrome.bookmarks.getTree();
    
    // 提取所有书签（异步）
    allBookmarks = await extractBookmarks(bookmarkTree, bookmarkTree);
    
    // 更新统计
    totalCountEl.textContent = allBookmarks.length;
    
    // 应用当前搜索过滤
    applyFilter();
    
    loadingEl.style.display = 'none';
    
    if (filteredBookmarks.length === 0) {
      emptyStateEl.style.display = 'block';
    } else {
      bookmarksListEl.style.display = 'grid';
      renderBookmarks();
    }
  } catch (error) {
    console.error('加载书签失败:', error);
    loadingEl.style.display = 'none';
    bookmarksListEl.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #dc3545;">
        <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
        <div>加载书签时出错: ${error.message}</div>
      </div>
    `;
    bookmarksListEl.style.display = 'block';
  }
}

// 渲染书签列表
function renderBookmarks() {
  if (filteredBookmarks.length === 0) {
    emptyStateEl.style.display = 'block';
    bookmarksListEl.style.display = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  bookmarksListEl.style.display = 'grid';

  bookmarksListEl.innerHTML = filteredBookmarks.map(bookmark => {
    // 提取域名用于显示
    let domain = '';
    try {
      const urlObj = new URL(bookmark.url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      domain = bookmark.url;
    }

    const bookmarkId = bookmark.id;
    const bookmarkUrl = bookmark.url;
    const bookmarkTitle = escapeHtml(bookmark.title);
    const escapedUrl = escapeHtml(bookmarkUrl);
    const tags = bookmark.tags || [];

    // 渲染tag HTML
    let tagsHtml = '';
    if (tags.length > 0) {
      tagsHtml = `
        <div class="bookmark-tags">
          ${tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    }

    return `
      <div class="bookmark-item" data-bookmark-id="${bookmarkId}" data-bookmark-url="${escapedUrl}" data-bookmark-title="${bookmarkTitle}">
        <button class="bookmark-menu-btn" data-menu-id="${bookmarkId}">⋮</button>
        <div class="bookmark-menu" id="menu-${bookmarkId}">
          <button class="bookmark-menu-item edit" data-bookmark-id="${bookmarkId}">编辑</button>
          <button class="bookmark-menu-item edit-tags" data-bookmark-id="${bookmarkId}">编辑标签</button>
          <button class="bookmark-menu-item generate-tags" data-bookmark-id="${bookmarkId}" data-bookmark-url="${escapedUrl}" data-bookmark-title="${bookmarkTitle}">智能生成标签</button>
          <button class="bookmark-menu-item copy-link" data-url="${escapedUrl}">复制链接</button>
          <button class="bookmark-menu-item delete" data-bookmark-id="${bookmarkId}" data-bookmark-title="${bookmarkTitle}">删除</button>
        </div>
        <div class="bookmark-title" id="title-${bookmarkId}">${bookmarkTitle}</div>
        <input type="text" class="bookmark-title-edit" id="title-edit-${bookmarkId}" value="${bookmarkTitle}" style="display: none;">
        <div class="bookmark-url" title="${escapedUrl}">${escapeHtml(domain)}</div>
        ${tagsHtml}
        <div class="bookmark-folder">${escapeHtml(bookmark.folder)}</div>
      </div>
    `;
  }).join('');
}

// HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 应用搜索过滤
function applyFilter() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  
  if (searchTerm === '') {
    filteredBookmarks = [...allBookmarks];
  } else {
    filteredBookmarks = allBookmarks.filter(bookmark => {
      return bookmark.title.toLowerCase().includes(searchTerm) ||
             bookmark.url.toLowerCase().includes(searchTerm) ||
             bookmark.folder.toLowerCase().includes(searchTerm);
    });
  }

  totalCountEl.textContent = filteredBookmarks.length;
  renderBookmarks();
}

// 切换菜单显示/隐藏
function toggleMenu(bookmarkId) {
  const menu = document.getElementById(`menu-${bookmarkId}`);
  if (menu) {
    // 如果菜单已经打开，则关闭它
    if (menu.classList.contains('show')) {
      menu.classList.remove('show');
    } else {
      // 否则先关闭所有菜单，再打开当前菜单
      closeAllMenus();
      menu.classList.add('show');
    }
  }
}

// 关闭指定菜单
function closeMenu(bookmarkId) {
  const menu = document.getElementById(`menu-${bookmarkId}`);
  if (menu) {
    menu.classList.remove('show');
  }
}

// 关闭所有菜单
function closeAllMenus() {
  const menus = document.querySelectorAll('.bookmark-menu');
  menus.forEach(menu => {
    menu.classList.remove('show');
  });
}

// 打开书签
function openBookmark(url) {
  chrome.tabs.create({ url: url });
}

// 复制链接
async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    // 可以添加提示信息
    showNotification('链接已复制到剪贴板');
  } catch (error) {
    console.error('复制失败:', error);
    // 降级方案：使用旧方法
    const textArea = document.createElement('textarea');
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification('链接已复制到剪贴板');
  }
}

// 开始编辑书签标题
function startEditBookmark(bookmarkId) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (titleEl && editInput) {
    titleEl.style.display = 'none';
    editInput.style.display = 'block';
    editInput.focus();
    editInput.select();
  }
}

// 取消编辑书签标题
function cancelEditBookmark(bookmarkId) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (titleEl && editInput) {
    // 恢复原始值
    const originalTitle = titleEl.textContent;
    editInput.value = originalTitle;
    editInput.style.display = 'none';
    titleEl.style.display = 'block';
  }
}

// 保存书签标题
function saveBookmarkTitle(bookmarkId, newTitle) {
  const titleEl = document.getElementById(`title-${bookmarkId}`);
  const editInput = document.getElementById(`title-edit-${bookmarkId}`);
  
  if (!titleEl || !editInput) {
    return;
  }

  // 如果标题为空，使用原标题
  if (!newTitle || newTitle.trim() === '') {
    cancelEditBookmark(bookmarkId);
    return;
  }

  // 如果标题没有改变，直接取消编辑
  const originalTitle = titleEl.textContent.trim();
  if (newTitle === originalTitle) {
    cancelEditBookmark(bookmarkId);
    return;
  }

  // 更新书签标题
  chrome.bookmarks.update(bookmarkId, { title: newTitle })
    .then(() => {
      // 更新显示
      titleEl.textContent = newTitle;
      editInput.value = newTitle;
      editInput.style.display = 'none';
      titleEl.style.display = 'block';
      
      // 更新数据
      const bookmark = allBookmarks.find(b => b.id === bookmarkId);
      if (bookmark) {
        bookmark.title = newTitle;
      }
      
      // 更新书签项的数据属性
      const bookmarkItem = titleEl.closest('.bookmark-item');
      if (bookmarkItem) {
        bookmarkItem.setAttribute('data-bookmark-title', escapeHtml(newTitle));
      }
      
      showNotification('书签标题已更新');
    })
    .catch(error => {
      console.error('更新书签标题失败:', error);
      alert('更新书签标题失败: ' + error.message);
      cancelEditBookmark(bookmarkId);
    });
}

// 解析tag输入文本（格式：#tag1 #tag2 #tag3）
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

// 格式化tag为显示文本（#tag1 #tag2 #tag3）
function formatTags(tags) {
  return tags.map(tag => `#${tag}`).join(' ');
}

// 开始编辑标签
async function startEditTags(bookmarkId) {
  // 获取当前标签
  const currentTags = await getBookmarkTags(bookmarkId);
  const currentTagsText = formatTags(currentTags);
  
  // 创建编辑对话框
  const dialog = document.createElement('div');
  dialog.className = 'tags-edit-dialog';
  dialog.innerHTML = `
    <div class="tags-edit-overlay"></div>
    <div class="tags-edit-content">
      <div class="tags-edit-header">
        <h3>编辑标签</h3>
        <button class="tags-edit-close">×</button>
      </div>
      <div class="tags-edit-body">
        <div class="tags-edit-hint">输入标签，以 # 开头，空格分隔（例如：#工作 #重要）</div>
        <input type="text" class="tags-edit-input" id="tags-edit-input-${bookmarkId}" 
               value="${escapeHtml(currentTagsText)}" 
               placeholder="#标签1 #标签2">
        <div class="tags-edit-preview" id="tags-edit-preview-${bookmarkId}"></div>
      </div>
      <div class="tags-edit-actions">
        <button class="tags-edit-btn cancel">取消</button>
        <button class="tags-edit-btn save">保存</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  const input = dialog.querySelector('.tags-edit-input');
  const preview = dialog.querySelector(`#tags-edit-preview-${bookmarkId}`);
  const closeBtn = dialog.querySelector('.tags-edit-close');
  const cancelBtn = dialog.querySelector('.tags-edit-btn.cancel');
  const saveBtn = dialog.querySelector('.tags-edit-btn.save');
  const overlay = dialog.querySelector('.tags-edit-overlay');
  
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
  input.addEventListener('input', updatePreview);
  
  // 关闭对话框
  function closeDialog() {
    document.body.removeChild(dialog);
  }
  
  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', closeDialog);
  
  // 保存标签
  saveBtn.addEventListener('click', async () => {
    const tags = parseTags(input.value);
    await saveBookmarkTags(bookmarkId, tags);
    closeDialog();
    showNotification('标签已保存');
    loadBookmarks(); // 重新加载以更新显示
  });
  
  // ESC键关闭
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDialog();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      saveBtn.click();
    }
  });
  
  // 聚焦输入框
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

// 保存书签标签
async function saveBookmarkTags(bookmarkId, tags) {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    bookmarkTags[bookmarkId] = tags;
    await chrome.storage.local.set({ bookmarkTags: bookmarkTags });
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

// 删除书签
function deleteBookmark(id, title) {
  if (confirm(`确定要删除书签 "${title}" 吗？`)) {
    chrome.bookmarks.remove(id).then(() => {
      showNotification('书签已删除');
      loadBookmarks();
    }).catch(error => {
      console.error('删除书签失败:', error);
      alert('删除书签失败: ' + error.message);
    });
  }
}

// 显示通知
function showNotification(message, type = 'success') {
  // 创建一个简单的通知
  const notification = document.createElement('div');
  
  // 根据类型设置不同的背景色
  let bgColor = '#28a745'; // 默认成功（绿色）
  if (type === 'error') {
    bgColor = '#dc3545'; // 错误（红色）
  } else if (type === 'info') {
    bgColor = '#17a2b8'; // 信息（蓝色）
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 根据类型设置自动隐藏时间
  const hideDelay = type === 'error' ? 5000 : (type === 'info' ? 4000 : 3000);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, hideDelay);
}

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 事件监听
searchInput.addEventListener('input', applyFilter);
refreshBtn.addEventListener('click', loadBookmarks);

// 监听存储变化（书签变化通知）
let lastChangeTimestamp = 0;

// 页面可见性变化时刷新（当用户切换回选项页面时）
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const allBookmarksView = document.getElementById('all-bookmarks');
    if (allBookmarksView && allBookmarksView.classList.contains('active')) {
      loadBookmarks();
    }
  }
});


// 侧边栏切换功能
function initSidebar() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const pageViews = document.querySelectorAll('.page-view');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.getAttribute('data-page');

      // 更新侧边栏激活状态
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // 切换页面视图
      pageViews.forEach(view => {
        view.classList.remove('active');
      });
      
      const targetView = document.getElementById(targetPage);
      if (targetView) {
        targetView.classList.add('active');
        
        // 如果切换到API设置页面，加载配置
        if (targetPage === 'api-settings') {
          loadApiConfigToForm();
        }
      }
    });
  });
}

// 初始化事件委托（在书签列表容器上统一处理事件）
function initEventDelegation() {
  const bookmarksListEl = document.getElementById('bookmarksList');
  
  // 使用事件委托处理所有书签相关的点击事件
  bookmarksListEl.addEventListener('click', (e) => {
    // 菜单按钮点击
    if (e.target.classList.contains('bookmark-menu-btn')) {
      e.stopPropagation();
      const menuId = e.target.getAttribute('data-menu-id');
      toggleMenu(menuId);
      return;
    }

    // 编辑按钮
    if (e.target.classList.contains('edit')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      if (bookmarkId) {
        startEditBookmark(bookmarkId);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 编辑标签按钮
    if (e.target.classList.contains('edit-tags')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      if (bookmarkId) {
        startEditTags(bookmarkId);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 智能生成标签按钮
    if (e.target.classList.contains('generate-tags')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      const bookmarkUrl = e.target.getAttribute('data-bookmark-url');
      const bookmarkTitle = e.target.getAttribute('data-bookmark-title');
      if (bookmarkId && bookmarkUrl) {
        generateSmartTagsForBookmarkOption(bookmarkId, bookmarkUrl, bookmarkTitle);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 复制链接按钮
    if (e.target.classList.contains('copy-link')) {
      e.stopPropagation();
      const url = e.target.getAttribute('data-url');
      if (url) {
        copyUrl(url);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 删除按钮
    if (e.target.classList.contains('delete')) {
      e.stopPropagation();
      const bookmarkId = e.target.getAttribute('data-bookmark-id');
      const bookmarkTitle = e.target.getAttribute('data-bookmark-title');
      if (bookmarkId && bookmarkTitle) {
        deleteBookmark(bookmarkId, bookmarkTitle);
      }
      const menuId = e.target.closest('.bookmark-menu').id.replace('menu-', '');
      closeMenu(menuId);
      return;
    }

    // 编辑输入框的事件处理
    if (e.target.classList.contains('bookmark-title-edit')) {
      e.stopPropagation();
      // 键盘事件在 input 元素上直接处理
      if (e.type === 'keydown') {
        if (e.key === 'Enter') {
          e.preventDefault();
          const bookmarkId = e.target.id.replace('title-edit-', '');
          saveBookmarkTitle(bookmarkId, e.target.value.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          const bookmarkId = e.target.id.replace('title-edit-', '');
          cancelEditBookmark(bookmarkId);
        }
      } else if (e.type === 'blur') {
        const bookmarkId = e.target.id.replace('title-edit-', '');
        saveBookmarkTitle(bookmarkId, e.target.value.trim());
      }
      return;
    }

    // 点击卡片打开网站（排除菜单按钮、菜单本身、编辑输入框）
    if (!e.target.closest('.bookmark-menu-btn') && 
        !e.target.closest('.bookmark-menu') && 
        !e.target.classList.contains('bookmark-title-edit')) {
      const bookmarkItem = e.target.closest('.bookmark-item');
      if (bookmarkItem) {
        const url = bookmarkItem.getAttribute('data-bookmark-url');
        if (url) {
          openBookmark(url);
        }
      }
    }
  });

  // 为编辑输入框添加 blur 事件（事件委托不支持 blur，需要单独添加）
  bookmarksListEl.addEventListener('blur', (e) => {
    if (e.target.classList.contains('bookmark-title-edit')) {
      const bookmarkId = e.target.id.replace('title-edit-', '');
      saveBookmarkTitle(bookmarkId, e.target.value.trim());
    }
  }, true);

  // 为编辑输入框添加 keydown 事件
  bookmarksListEl.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('bookmark-title-edit')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const bookmarkId = e.target.id.replace('title-edit-', '');
        saveBookmarkTitle(bookmarkId, e.target.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const bookmarkId = e.target.id.replace('title-edit-', '');
        cancelEditBookmark(bookmarkId);
      }
    }
  });
}

// 当前选中的收藏夹ID
let currentFolderId = '0';
let bookmarkTreeCache = null;

// 获取所有书签树
async function getBookmarkTree() {
  if (!bookmarkTreeCache) {
    bookmarkTreeCache = await chrome.bookmarks.getTree();
  }
  return bookmarkTreeCache;
}

// 清空缓存
function clearBookmarkTreeCache() {
  bookmarkTreeCache = null;
}

// 渲染收藏夹树
async function renderFoldersTree() {
  const foldersTreeEl = document.getElementById('foldersTree');
  if (!foldersTreeEl) return;

  try {
    const tree = await getBookmarkTree();
    const rootNode = tree[0]; // 根节点

    function renderTreeNode(node, level = 0) {
      // 跳过根节点本身，只处理其子节点
      if (node.id === '0') {
        if (!node.children) return '';
        return node.children
          .filter(child => !child.url) // 只显示文件夹
          .map(child => renderTreeNode(child, level))
          .join('');
      }

      // 如果是文件夹
      if (!node.url && node.children) {
        const hasChildren = node.children.some(child => !child.url);
        const indent = level * 16;
        
        let html = `
          <div class="tree-folder-item ${hasChildren ? 'has-children' : ''}" 
               data-folder-id="${node.id}" 
               data-folder-name="${escapeHtml(node.title)}"
               style="padding-left: ${indent}px;">
            <span class="tree-folder-item-text">${escapeHtml(node.title)}</span>
          </div>
        `;

        if (hasChildren) {
          html += `<div class="tree-folder-children">`;
          node.children
            .filter(child => !child.url) // 只处理文件夹
            .forEach(child => {
              html += renderTreeNode(child, level + 1);
            });
          html += `</div>`;
        }

        return html;
      }
      return '';
    }

    foldersTreeEl.innerHTML = renderTreeNode(rootNode);

    // 为树节点添加事件
    const treeItems = foldersTreeEl.querySelectorAll('.tree-folder-item');
    treeItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.getAttribute('data-folder-name');
        
        // 展开/折叠
        if (item.classList.contains('has-children')) {
          item.classList.toggle('expanded');
        }
        
        // 选中
        treeItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // 加载内容
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
      });
    });

    // 默认选中根节点并加载
    if (treeItems.length > 0) {
      treeItems[0].click();
    }
  } catch (error) {
    console.error('渲染收藏夹树失败:', error);
    foldersTreeEl.innerHTML = `
      <div class="folders-empty">
        <div class="folders-empty-text">加载失败</div>
      </div>
    `;
  }
}

// 更新面包屑导航
function updateBreadcrumb(folderId) {
  const breadcrumbEl = document.getElementById('foldersBreadcrumb');
  if (!breadcrumbEl) return;

  async function buildBreadcrumb(targetId) {
    const tree = await getBookmarkTree();
    const path = [];
    
    function findPath(nodes, targetId, currentPath = []) {
      for (const node of nodes) {
        const newPath = node.id === '0' ? [] : [...currentPath, { id: node.id, title: node.title }];
        
        if (node.id === targetId) {
          path.push(...newPath);
          return true;
        }
        
        if (node.children) {
          if (findPath(node.children, targetId, newPath)) {
            return true;
          }
        }
      }
      return false;
    }
    
    findPath(tree, targetId);
    
    let html = '<span class="breadcrumb-item active" data-folder-id="0">收藏夹</span>';
    
    path.forEach((folder, index) => {
      html += '<span class="breadcrumb-separator">›</span>';
      const isLast = index === path.length - 1;
      html += `
        <span class="breadcrumb-item ${isLast ? 'active' : ''}" 
              data-folder-id="${folder.id}">
          ${escapeHtml(folder.title)}
        </span>
      `;
    });
    
    breadcrumbEl.innerHTML = html;
    
    // 为面包屑添加点击事件
    const breadcrumbItems = breadcrumbEl.querySelectorAll('.breadcrumb-item:not(.active)');
    breadcrumbItems.forEach(item => {
      item.addEventListener('click', () => {
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.textContent.trim();
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
        
        // 更新树选中状态
        const treeItems = document.querySelectorAll('.tree-folder-item');
        treeItems.forEach(treeItem => {
          treeItem.classList.remove('active');
          if (treeItem.getAttribute('data-folder-id') === folderId) {
            treeItem.classList.add('active');
            // 确保父节点都展开
            let parent = treeItem.parentElement;
            while (parent && !parent.classList.contains('folders-tree-content')) {
              const folderItem = parent.previousElementSibling;
              if (folderItem && folderItem.classList.contains('tree-folder-item')) {
                folderItem.classList.add('expanded');
              }
              parent = parent.parentElement;
            }
          }
        });
      });
    });
  }
  
  buildBreadcrumb(folderId);
}

// 加载收藏夹内容
async function loadFolderContent(folderId, folderName) {
  const viewContentEl = document.getElementById('foldersViewContent');
  if (!viewContentEl) return;

  try {
    viewContentEl.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>正在加载...</div>
      </div>
    `;

    const tree = await getBookmarkTree();
    let targetNode = null;
    
    // 查找目标节点
    function findNode(nodes, targetId) {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    }
    
    targetNode = findNode(tree, folderId);
    if (!targetNode || !targetNode.children) {
      viewContentEl.innerHTML = `
        <div class="folders-empty">
          <div class="folders-empty-icon">—</div>
          <div class="folders-empty-text">此收藏夹为空</div>
        </div>
      `;
      return;
    }

    const folders = [];
    const bookmarks = [];
    
    targetNode.children.forEach(child => {
      if (child.url) {
        // 书签
        bookmarks.push({
          id: child.id,
          title: child.title || '无标题',
          url: child.url
        });
      } else {
        // 子收藏夹
        folders.push({
          id: child.id,
          title: child.title
        });
      }
    });

    if (folders.length === 0 && bookmarks.length === 0) {
      viewContentEl.innerHTML = `
        <div class="folders-empty">
          <div class="folders-empty-icon">—</div>
          <div class="folders-empty-text">此收藏夹为空</div>
        </div>
      `;
      return;
    }

    // 渲染网格视图
    let html = '<div class="folders-grid">';
    
    // 先显示子收藏夹
    folders.forEach(folder => {
      html += `
        <div class="folder-grid-item" data-folder-id="${folder.id}" data-folder-name="${escapeHtml(folder.title)}">
          <div class="folder-grid-icon">📁</div>
          <div class="folder-grid-name">${escapeHtml(folder.title)}</div>
        </div>
      `;
    });
    
    // 再显示书签
    bookmarks.forEach(bookmark => {
      let domain = '';
      try {
        const urlObj = new URL(bookmark.url);
        domain = urlObj.hostname.replace('www.', '');
      } catch (e) {
        domain = bookmark.url;
      }
      
      html += `
        <div class="bookmark-grid-item" data-bookmark-id="${bookmark.id}" data-bookmark-url="${escapeHtml(bookmark.url)}">
          <div class="bookmark-grid-icon">🔖</div>
          <div class="bookmark-grid-name" title="${escapeHtml(bookmark.title)}">${escapeHtml(bookmark.title)}</div>
        </div>
      `;
    });
    
    html += '</div>';
    viewContentEl.innerHTML = html;

    // 为收藏夹和书签添加点击事件
    const folderItems = viewContentEl.querySelectorAll('.folder-grid-item');
    folderItems.forEach(item => {
      item.addEventListener('click', () => {
        const folderId = item.getAttribute('data-folder-id');
        const folderName = item.getAttribute('data-folder-name');
        currentFolderId = folderId;
        loadFolderContent(folderId, folderName);
        updateBreadcrumb(folderId);
        
        // 更新树选中状态
        const treeItems = document.querySelectorAll('.tree-folder-item');
        treeItems.forEach(treeItem => {
          treeItem.classList.remove('active');
          if (treeItem.getAttribute('data-folder-id') === folderId) {
            treeItem.classList.add('active');
          }
        });
      });
    });

    const bookmarkItems = viewContentEl.querySelectorAll('.bookmark-grid-item');
    bookmarkItems.forEach(item => {
      item.addEventListener('click', () => {
        const url = item.getAttribute('data-bookmark-url');
        if (url) {
          openBookmark(url);
        }
      });
    });

  } catch (error) {
    console.error('加载收藏夹内容失败:', error);
    viewContentEl.innerHTML = `
      <div class="folders-empty">
        <div class="folders-empty-icon">—</div>
        <div class="folders-empty-text">加载失败</div>
      </div>
    `;
  }
}

// 侧边栏切换时加载收藏夹树
function initSidebar() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const pageViews = document.querySelectorAll('.page-view');

  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.getAttribute('data-page');

      // 更新侧边栏激活状态
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // 切换页面视图
      pageViews.forEach(view => {
        view.classList.remove('active');
      });
      
      const targetView = document.getElementById(targetPage);
      if (targetView) {
        targetView.classList.add('active');
        
        // 如果切换到收藏夹页面，加载收藏夹树
        if (targetPage === 'page-1') {
          clearBookmarkTreeCache();
          renderFoldersTree();
        }
        
        // 如果切换到标签检索页面，加载标签列表
        if (targetPage === 'page-2') {
          renderTagsList();
        }
      }
    });
  });
}

// 获取所有标签及其数量
async function getAllTagsWithCount() {
  try {
    const result = await chrome.storage.local.get('bookmarkTags');
    const bookmarkTags = result.bookmarkTags || {};
    
    // 统计每个标签的数量
    const tagCounts = {};
    for (const bookmarkId in bookmarkTags) {
      const tags = bookmarkTags[bookmarkId];
      for (const tag of tags) {
        if (tagCounts[tag]) {
          tagCounts[tag]++;
        } else {
          tagCounts[tag] = 1;
        }
      }
    }
    
    // 转换为数组并排序（按使用次数降序）
    const tagsArray = Object.keys(tagCounts).map(tag => ({
      name: tag,
      count: tagCounts[tag]
    })).sort((a, b) => b.count - a.count);
    
    return tagsArray;
  } catch (error) {
    console.error('获取标签列表失败:', error);
    return [];
  }
}

// 渲染标签列表
async function renderTagsList() {
  const tagsListEl = document.getElementById('tagsList');
  if (!tagsListEl) return;

  try {
    tagsListEl.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>正在加载标签...</div>
      </div>
    `;

    const tags = await getAllTagsWithCount();

    if (tags.length === 0) {
      tagsListEl.classList.add('empty');
      tagsListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">—</div>
          <div class="empty-state-text">暂无标签</div>
          <div class="empty-state-hint">请为书签添加标签后查看</div>
        </div>
      `;
      return;
    }

    // 移除 empty 类（如果有标签）
    tagsListEl.classList.remove('empty');

    tagsListEl.innerHTML = tags.map(tag => `
      <div class="tag-card" data-tag-name="${escapeHtml(tag.name)}">
        <div class="tag-card-name">#${escapeHtml(tag.name)}</div>
      </div>
    `).join('');

    // 为标签卡片添加点击事件（后续可以添加筛选功能）
    const tagCards = tagsListEl.querySelectorAll('.tag-card');
    tagCards.forEach(card => {
      card.addEventListener('click', () => {
        // TODO: 后续可以实现点击标签筛选书签的功能
        console.log('点击了标签:', card.getAttribute('data-tag-name'));
      });
    });

  } catch (error) {
    console.error('渲染标签列表失败:', error);
    tagsListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">—</div>
        <div class="empty-state-text">加载失败</div>
      </div>
    `;
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化侧边栏
  initSidebar();
  
  // 初始化事件委托
  initEventDelegation();
  
  // 点击页面其他地方时关闭所有菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bookmark-menu-btn') && !e.target.closest('.bookmark-menu')) {
      closeAllMenus();
    }
  });
  
  // 只在"所有标签"页面加载书签
  loadBookmarks();
  
  // 在 DOM 加载后再设置存储监听器
  // 检查 chrome.storage API 是否可用
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.bookmarkChange) {
          const change = changes.bookmarkChange.newValue;
          if (change && change.timestamp > lastChangeTimestamp) {
            lastChangeTimestamp = change.timestamp;
            
            // 更新"所有标签"页面
            const allBookmarksView = document.getElementById('all-bookmarks');
            if (allBookmarksView && allBookmarksView.classList.contains('active')) {
              loadBookmarks();
            }
            
            // 更新收藏夹页面
            const foldersView = document.getElementById('page-1');
            if (foldersView && foldersView.classList.contains('active')) {
              clearBookmarkTreeCache();
              renderFoldersTree();
            }
          }
        }
      });
      console.log('书签变化监听器已设置');
    } catch (error) {
      console.warn('无法监听存储变化:', error);
    }
  } else {
    console.warn('chrome.storage API 不可用，将使用页面可见性变化来更新');
  }

  // 初始化API设置页面
  initApiSettings();
});

// ==================== API配置相关功能 ====================

/**
 * 初始化API设置页面
 */
function initApiSettings() {
  // 如果当前已经是API设置页面，直接加载配置
  const apiSettingsPage = document.getElementById('api-settings');
  if (apiSettingsPage && apiSettingsPage.classList.contains('active')) {
    loadApiConfigToForm();
  }

  // 绑定表单事件
  bindApiFormEvents();
}

/**
 * 加载API配置到表单
 */
async function loadApiConfigToForm() {
  try {
    if (typeof ApiConfig === 'undefined') {
      console.error('ApiConfig 未加载');
      showApiStatus('error', 'API配置模块未加载，请刷新页面');
      return;
    }

    const config = await ApiConfig.getApiConfig();
    
    // 填充表单
    const enabledCheckbox = document.getElementById('apiEnabled');
    const providerSelect = document.getElementById('apiProvider');
    const endpointInput = document.getElementById('apiEndpoint');
    const apiKeyInput = document.getElementById('apiKey');
    const modelInput = document.getElementById('apiModel');
    const temperatureRange = document.getElementById('apiTemperature');
    const temperatureValue = document.getElementById('temperatureValue');
    const maxTokensInput = document.getElementById('apiMaxTokens');
    const timeoutInput = document.getElementById('apiTimeout');

    // 先填充表单字段，使用保存的配置值
    if (enabledCheckbox) enabledCheckbox.checked = config.enabled || false;
    if (providerSelect) providerSelect.value = config.provider || 'openai';
    
    // 重要：使用已保存的配置值，不要被默认值覆盖
    if (endpointInput) {
      // 如果配置中有 endpoint 值，使用配置值；否则保持为空
      endpointInput.value = config.endpoint || '';
    }
    if (apiKeyInput) {
      apiKeyInput.value = config.apiKey || '';
    }
    if (modelInput) {
      // 如果配置中有 model 值，使用配置值；否则保持为空
      modelInput.value = config.model || '';
    }
    if (temperatureRange) {
      temperatureRange.value = config.temperature !== undefined ? config.temperature : 0.7;
      if (temperatureValue) {
        temperatureValue.textContent = temperatureRange.value;
      }
    }
    if (maxTokensInput) {
      maxTokensInput.value = config.maxTokens !== undefined ? config.maxTokens : 500;
    }
    if (timeoutInput) {
      timeoutInput.value = config.timeout !== undefined ? config.timeout : 30000;
    }

    // 更新提供商相关的选项（模型建议列表等），但不覆盖已填充的值
    updateProviderOptions(config.provider || 'openai', true); // 传入第二个参数表示不覆盖已存在的值

    // 更新当前配置显示
    updateCurrentConfigDisplay(config);

    console.log('API配置已加载到表单');
  } catch (error) {
    console.error('加载API配置失败:', error);
    showApiStatus('error', '加载配置失败：' + error.message);
  }
}

/**
 * 更新当前配置显示
 */
function updateCurrentConfigDisplay(config) {
  const currentConfigCard = document.getElementById('currentConfigCard');
  const currentConfigStatus = document.getElementById('currentConfigStatus');
  const currentConfigEnabled = document.getElementById('currentConfigEnabled');
  const currentConfigProvider = document.getElementById('currentConfigProvider');
  const currentConfigEndpoint = document.getElementById('currentConfigEndpoint');
  const currentConfigModel = document.getElementById('currentConfigModel');
  const currentConfigAdvanced = document.getElementById('currentConfigAdvanced');
  const currentConfigAdvancedParams = document.getElementById('currentConfigAdvancedParams');

  if (!currentConfigCard) return;

  if (!config || !config.endpoint || !config.apiKey) {
    // 如果配置不完整，隐藏显示
    currentConfigCard.style.display = 'none';
    return;
  }

  // 显示配置卡片
  currentConfigCard.style.display = 'block';

  // 获取提供商名称
  let providerName = '未知';
  if (typeof ApiConfig !== 'undefined' && ApiConfig.PROVIDER_CONFIGS[config.provider]) {
    providerName = ApiConfig.PROVIDER_CONFIGS[config.provider].name;
  } else {
    providerName = config.provider || '自定义';
  }

  // 更新状态
  if (config.enabled) {
    if (currentConfigStatus) {
      currentConfigStatus.textContent = '已启用';
      currentConfigStatus.className = 'current-config-status enabled';
    }
  } else {
    if (currentConfigStatus) {
      currentConfigStatus.textContent = '未启用';
      currentConfigStatus.className = 'current-config-status disabled';
    }
  }

  // 更新配置信息
  if (currentConfigEnabled) {
    currentConfigEnabled.textContent = config.enabled ? '已启用' : '未启用';
    currentConfigEnabled.className = config.enabled ? 'status-enabled' : 'status-disabled';
  }

  if (currentConfigProvider) {
    currentConfigProvider.textContent = providerName;
  }

  if (currentConfigEndpoint) {
    // 截断过长的端点显示
    let endpoint = config.endpoint || '未设置';
    if (endpoint.length > 60) {
      endpoint = endpoint.substring(0, 30) + '...' + endpoint.substring(endpoint.length - 27);
    }
    currentConfigEndpoint.textContent = endpoint;
    currentConfigEndpoint.title = config.endpoint || '';
  }

  if (currentConfigModel) {
    currentConfigModel.textContent = config.model || '未设置';
  }

  // 高级参数显示
  if (currentConfigAdvanced && currentConfigAdvancedParams) {
    const advancedParams = [];
    if (config.temperature !== undefined && config.temperature !== 0.7) {
      advancedParams.push(`温度: ${config.temperature}`);
    }
    if (config.maxTokens !== undefined && config.maxTokens !== 500) {
      advancedParams.push(`最大Token: ${config.maxTokens}`);
    }
    if (config.timeout !== undefined && config.timeout !== 30000) {
      advancedParams.push(`超时: ${config.timeout}ms`);
    }

    if (advancedParams.length > 0) {
      currentConfigAdvanced.style.display = 'flex';
      currentConfigAdvancedParams.textContent = advancedParams.join(' | ');
    } else {
      currentConfigAdvanced.style.display = 'none';
    }
  }
}

/**
 * 更新提供商相关的选项（模型列表等）
 * @param {string} provider - 提供商名称
 * @param {boolean} preserveExistingValues - 是否保留已存在的值（默认 false）
 */
function updateProviderOptions(provider, preserveExistingValues = false) {
  if (typeof ApiConfig === 'undefined') return;

  const providerConfig = ApiConfig.PROVIDER_CONFIGS[provider];
  if (!providerConfig) return;

  const modelInput = document.getElementById('apiModel');
  const modelSuggestions = document.getElementById('modelSuggestions');
  const endpointInput = document.getElementById('apiEndpoint');

  // 更新端点（如果为空且不保留已存在的值）
  if (endpointInput && !preserveExistingValues && !endpointInput.value) {
    endpointInput.value = providerConfig.endpoint || '';
  }

  // 更新模型建议列表（总是更新，这是下拉选项）
  if (modelSuggestions && providerConfig.models && providerConfig.models.length > 0) {
    modelSuggestions.innerHTML = '';
    providerConfig.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      modelSuggestions.appendChild(option);
    });
  }

  // 如果当前模型为空且不保留已存在的值，设置默认模型
  if (modelInput && !preserveExistingValues && !modelInput.value && providerConfig.defaultModel) {
    modelInput.value = providerConfig.defaultModel;
  }
}

/**
 * 绑定表单事件
 */
function bindApiFormEvents() {
  // 提供商选择变化时更新选项
  const providerSelect = document.getElementById('apiProvider');
  if (providerSelect) {
    providerSelect.addEventListener('change', (e) => {
      const provider = e.target.value;
      updateProviderOptions(provider);
    });
  }

  // 温度滑块实时更新显示值
  const temperatureRange = document.getElementById('apiTemperature');
  const temperatureValue = document.getElementById('temperatureValue');
  if (temperatureRange && temperatureValue) {
    temperatureRange.addEventListener('input', (e) => {
      temperatureValue.textContent = e.target.value;
    });
  }

  // API Key 显示/隐藏切换
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const apiKeyInput = document.getElementById('apiKey');
  if (toggleApiKeyBtn && apiKeyInput) {
    toggleApiKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁';
      toggleApiKeyBtn.title = isPassword ? '隐藏' : '显示';
    });
  }

  // 高级设置展开/折叠
  const toggleAdvancedBtn = document.getElementById('toggleAdvanced');
  const advancedSettings = document.getElementById('advancedSettings');
  if (toggleAdvancedBtn && advancedSettings) {
    toggleAdvancedBtn.addEventListener('click', () => {
      const isExpanded = advancedSettings.style.display !== 'none';
      advancedSettings.style.display = isExpanded ? 'none' : 'block';
      toggleAdvancedBtn.classList.toggle('expanded', !isExpanded);
    });
  }

  // 保存配置按钮
  const saveBtn = document.getElementById('saveApiConfig');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      await saveApiConfigFromForm();
    });
  }

  // 测试连接按钮
  const testBtn = document.getElementById('testApiConfig');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      await testApiConnection();
    });
  }

  // 重置配置按钮
  const resetBtn = document.getElementById('resetApiConfig');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      await resetApiConfigToDefault();
    });
  }
}

/**
 * 从表单获取配置数据
 */
function getConfigFromForm() {
  const enabledCheckbox = document.getElementById('apiEnabled');
  const providerSelect = document.getElementById('apiProvider');
  const endpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');
  const modelInput = document.getElementById('apiModel');
  const temperatureRange = document.getElementById('apiTemperature');
  const maxTokensInput = document.getElementById('apiMaxTokens');
  const timeoutInput = document.getElementById('apiTimeout');

  return {
    enabled: enabledCheckbox ? enabledCheckbox.checked : false,
    provider: providerSelect ? providerSelect.value : 'openai',
    endpoint: endpointInput ? endpointInput.value.trim() : '',
    apiKey: apiKeyInput ? apiKeyInput.value.trim() : '',
    model: modelInput ? modelInput.value.trim() : '',
    temperature: temperatureRange ? parseFloat(temperatureRange.value) : 0.7,
    maxTokens: maxTokensInput ? parseInt(maxTokensInput.value) : 500,
    timeout: timeoutInput ? parseInt(timeoutInput.value) : 30000
  };
}

/**
 * 验证表单数据
 */
function validateApiForm() {
  const config = getConfigFromForm();
  const errors = [];

  if (!config.endpoint) {
    errors.push('API端点为必填项');
  } else {
    try {
      const url = new URL(config.endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('API端点必须是 http 或 https 协议');
      }
    } catch (e) {
      errors.push('API端点格式不正确');
    }
  }

  if (!config.apiKey) {
    errors.push('API Key 为必填项');
  }

  if (!config.model && config.provider !== 'custom') {
    errors.push('模型名称为必填项');
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('温度必须在 0-2 之间');
  }

  if (config.maxTokens < 1 || config.maxTokens > 4000) {
    errors.push('最大Token数必须在 1-4000 之间');
  }

  if (config.timeout < 1000 || config.timeout > 120000) {
    errors.push('超时时间必须在 1000-120000 毫秒之间');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 从表单保存API配置
 */
async function saveApiConfigFromForm() {
  try {
    if (typeof ApiConfig === 'undefined') {
      showApiStatus('error', 'API配置模块未加载');
      return;
    }

    // 验证表单
    const validation = validateApiForm();
    if (!validation.valid) {
      showApiStatus('error', '配置验证失败：\n' + validation.errors.join('\n'));
      return;
    }

    // 使用 ApiConfig 验证
    const config = getConfigFromForm();
    const apiValidation = ApiConfig.validateApiConfig(config);
    if (!apiValidation.valid) {
      showApiStatus('error', '配置验证失败：\n' + apiValidation.errors.join('\n'));
      return;
    }

    // 保存配置
    const saveResult = await ApiConfig.saveApiConfig(config, true); // 加密存储 API Key
    if (!saveResult) {
      throw new Error('保存配置失败');
    }

    // 验证保存是否成功 - 重新读取配置确认
    const savedConfig = await ApiConfig.getApiConfig();
    console.log('保存后的配置验证:', {
      provider: savedConfig.provider,
      endpoint: savedConfig.endpoint ? savedConfig.endpoint.substring(0, 30) + '...' : '未设置',
      model: savedConfig.model,
      enabled: savedConfig.enabled,
      hasApiKey: !!savedConfig.apiKey
    });

    showApiStatus('success', '配置已保存成功！');

    // 更新当前配置显示
    updateCurrentConfigDisplay(savedConfig);

    console.log('API配置已保存并验证');
  } catch (error) {
    console.error('保存API配置失败:', error);
    showApiStatus('error', '保存配置失败：' + error.message);
  }
}

/**
 * 测试API连接
 */
async function testApiConnection() {
  try {
    if (typeof ApiConfig === 'undefined') {
      showApiStatus('error', 'API配置模块未加载');
      return;
    }

    // 验证表单
    const validation = validateApiForm();
    if (!validation.valid) {
      showApiStatus('error', '请先填写完整的配置信息');
      return;
    }

    const config = getConfigFromForm();
    
    // 禁用按钮
    const testBtn = document.getElementById('testApiConfig');
    const saveBtn = document.getElementById('saveApiConfig');
    if (testBtn) testBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;

    showApiStatus('info', '正在测试API连接...');

    // 构建测试请求
    const testPrompt = '请返回"测试成功"四个字';
    
    let response;
    if (config.provider === 'openai' || config.provider === 'deepseek') {
      // OpenAI 和 DeepSeek 使用相同的格式
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'user', content: testPrompt }
          ],
          max_tokens: 50,
          temperature: 0.7
        })
      });
    } else if (config.provider === 'claude') {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 50,
          messages: [
            { role: 'user', content: testPrompt }
          ]
        })
      });
    } else {
      // 自定义API，使用通用格式
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'user', content: testPrompt }
          ],
          max_tokens: 50
        })
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API请求失败 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    showApiStatus('success', 'API连接测试成功！\n响应已收到，配置正确。');

  } catch (error) {
    console.error('测试API连接失败:', error);
    showApiStatus('error', 'API连接测试失败：' + error.message);
  } finally {
    // 恢复按钮
    const testBtn = document.getElementById('testApiConfig');
    const saveBtn = document.getElementById('saveApiConfig');
    if (testBtn) testBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

/**
 * 重置配置为默认值
 */
async function resetApiConfigToDefault() {
  try {
    if (typeof ApiConfig === 'undefined') {
      showApiStatus('error', 'API配置模块未加载');
      return;
    }

    if (!confirm('确定要重置API配置为默认值吗？')) {
      return;
    }

    await ApiConfig.resetApiConfig();
    await loadApiConfigToForm();
    showApiStatus('success', '配置已重置为默认值');

    console.log('API配置已重置');
  } catch (error) {
    console.error('重置API配置失败:', error);
    showApiStatus('error', '重置配置失败：' + error.message);
  }
}

/**
 * 显示API状态提示
 */
function showApiStatus(type, message) {
  const statusEl = document.getElementById('apiConfigStatus');
  if (!statusEl) return;

  statusEl.className = `api-status ${type}`;
  statusEl.textContent = message;
  statusEl.style.display = 'block';

  // 如果是成功消息，3秒后自动隐藏
  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

// ==================== 智能标签生成功能（选项页面） ====================

/**
 * 生成智能标签（选项页面版本）
 */
async function generateSmartTagsForBookmarkOption(bookmarkId, bookmarkUrl, bookmarkTitle) {
  try {
    // 检查API配置
    const configResult = await chrome.storage.local.get('aiApiConfig');
    const apiConfig = configResult.aiApiConfig;

    if (!apiConfig || !apiConfig.enabled) {
      showNotification('智能标签功能未启用，请在API设置中配置', 'error');
      return;
    }

    // 显示加载提示
    showNotification('正在生成标签...', 'info');

    // 构建书签对象
    const bookmark = {
      id: bookmarkId,
      url: bookmarkUrl,
      title: bookmarkTitle || '无标题'
    };

    // 尝试查找匹配的标签页
    let targetTabId = null;
    try {
      const allTabs = await chrome.tabs.query({ url: bookmarkUrl });
      if (allTabs.length > 0) {
        targetTabId = allTabs[0].id;
      } else {
        // 如果标签页未打开，提示用户
        const shouldContinue = confirm('该页面的标签页未打开，将使用简化方案生成标签（仅使用标题和URL）。\n\n是否继续？\n\n提示：如果页面已打开，请刷新页面后再试。');
        if (!shouldContinue) {
          return;
        }
      }
    } catch (error) {
      console.warn('查找标签页失败:', error);
    }

    // 发送消息到 background 生成标签
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GENERATE_SMART_TAGS',
        bookmarkId: bookmarkId,
        bookmark: bookmark,
        tabId: targetTabId
      });

      if (response && response.success) {
        const newTagsCount = (response.newTags || []).length;
        if (newTagsCount > 0) {
          showNotification(`成功生成 ${newTagsCount} 个新标签`, 'success');
          // 重新加载书签以更新显示
          loadBookmarks();
        } else {
          showNotification('未生成新的标签', 'info');
        }
      } else {
        throw new Error(response?.error || '生成标签失败');
      }
    } catch (error) {
      console.error('生成智能标签失败:', error);
      showNotification(error.message || '生成标签失败，请稍后重试', 'error');
    }
  } catch (error) {
    console.error('生成智能标签失败:', error);
    showNotification('生成标签时发生错误', 'error');
  }
}

