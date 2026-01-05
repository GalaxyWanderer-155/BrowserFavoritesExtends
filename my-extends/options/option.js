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

// 递归提取所有书签
function extractBookmarks(nodes, bookmarkTree, bookmarks = []) {
  for (const node of nodes) {
    if (node.url) {
      // 这是一个书签
      bookmarks.push({
        id: node.id,
        title: node.title || '无标题',
        url: node.url,
        folder: getFolderPath(node, bookmarkTree)
      });
    }
    if (node.children) {
      // 这是一个文件夹，递归处理
      extractBookmarks(node.children, bookmarkTree, bookmarks);
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
    
    // 提取所有书签
    allBookmarks = extractBookmarks(bookmarkTree, bookmarkTree);
    
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

    return `
      <div class="bookmark-item" data-bookmark-id="${bookmarkId}" data-bookmark-url="${escapedUrl}" data-bookmark-title="${bookmarkTitle}">
        <button class="bookmark-menu-btn" data-menu-id="${bookmarkId}">⋮</button>
        <div class="bookmark-menu" id="menu-${bookmarkId}">
          <button class="bookmark-menu-item edit" data-bookmark-id="${bookmarkId}">编辑</button>
          <button class="bookmark-menu-item copy-link" data-url="${escapedUrl}">复制链接</button>
          <button class="bookmark-menu-item delete" data-bookmark-id="${bookmarkId}" data-bookmark-title="${bookmarkTitle}">删除</button>
        </div>
        <div class="bookmark-title" id="title-${bookmarkId}">${bookmarkTitle}</div>
        <input type="text" class="bookmark-title-edit" id="title-edit-${bookmarkId}" value="${bookmarkTitle}" style="display: none;">
        <div class="bookmark-url" title="${escapedUrl}">${escapeHtml(domain)}</div>
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
function showNotification(message) {
  // 创建一个简单的通知
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
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
      }
    });
  });
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
});

