// 页面内容提取工具模块
// 注意：此模块主要用于提供工具函数，实际 DOM 操作在 content.js 中完成
// 这些函数可以用于处理已提取的数据，或作为工具函数被调用

/**
 * 检查元素是否可见
 * @param {HTMLElement} element - DOM元素
 * @returns {boolean} 是否可见
 */
function isElementVisible(element) {
  if (!element) return false;
  
  try {
    const style = window.getComputedStyle(element);
    
    // 检查 display 和 visibility
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    
    // 检查 hidden 属性
    if (element.hasAttribute('hidden')) {
      return false;
    }
    
    // 检查透明度
    if (parseFloat(style.opacity) === 0) {
      return false;
    }
    
    // 检查元素尺寸
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn('检查元素可见性失败:', error);
    return false;
  }
}

/**
 * 从元素中提取可见文本
 * @param {HTMLElement} element - DOM元素
 * @returns {string} 提取的文本内容
 */
function extractVisibleText(element) {
  if (!element) return '';
  
  try {
    let text = '';
    
    // 使用 TreeWalker 遍历所有文本节点
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过脚本和样式内容
          const parent = node.parentElement;
          if (parent) {
            const tagName = parent.tagName.toUpperCase();
            if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
              return NodeFilter.FILTER_REJECT;
            }
            
            // 检查父元素是否可见
            if (!isElementVisible(parent)) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const textContent = node.textContent.trim();
      if (textContent && textContent.length > 0) {
        text += textContent + ' ';
      }
    }

    // 清理多余空白
    return text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.warn('提取可见文本失败:', error);
    return '';
  }
}

/**
 * 提取主要内容区域元素
 * @returns {HTMLElement|null} 主要内容元素
 */
function extractMainContent() {
  try {
    // 优先级顺序：main > article > [role="main"] > 常见内容类名
    const selectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main-content',
      '.post',
      '.article',
      '.entry-content',
      '.post-content',
      '#content',
      '#main-content',
      '.page-content',
      '.main',
      '.container .content'
    ];

    // 尝试按优先级查找
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && isElementVisible(element)) {
          return element;
        }
      } catch (e) {
        // 选择器可能无效，继续尝试下一个
        continue;
      }
    }

    // 如果没找到，返回 body（将在调用处进一步处理）
    return document.body;
  } catch (error) {
    console.warn('提取主要内容区域失败:', error);
    return document.body || null;
  }
}

/**
 * 排除不需要的元素
 * @param {HTMLElement} element - 要处理的元素
 * @returns {HTMLElement} 处理后的元素（克隆）
 */
function excludeUnnecessaryElements(element) {
  if (!element) return null;
  
  try {
    // 克隆元素以避免修改原始 DOM
    const clonedContent = element.cloneNode(true);

    // 排除的选择器列表
    const excludeSelectors = [
      'nav',
      'header',
      'footer',
      'aside',
      '.navigation',
      '.menu',
      '.sidebar',
      '.footer',
      '.header',
      '.ad',
      '.advertisement',
      '[class*="ad"]',
      '[class*="advertisement"]',
      '[id*="ad"]',
      '.social-share',
      '.share-buttons',
      '.comments',
      'script',
      'style',
      'noscript',
      'iframe[src*="ads"]',
      'iframe[src*="advertisement"]'
    ];

    // 移除排除的元素
    excludeSelectors.forEach(selector => {
      try {
        const elements = clonedContent.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // 选择器可能无效，忽略
      }
    });

    return clonedContent;
  } catch (error) {
    console.warn('排除元素失败:', error);
    return element;
  }
}

/**
 * 提取所有 Meta 标签信息
 * @returns {Object} Meta信息对象
 */
function extractMetaInfo() {
  const metaInfo = {
    description: '',
    keywords: '',
    author: '',
    openGraph: {},
    twitter: {},
    other: {}
  };

  try {
    // 提取标准 Meta 标签
    const metaTags = document.querySelectorAll('meta');
    
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name');
      const property = meta.getAttribute('property');
      const content = meta.getAttribute('content');
      
      if (!content) return;

      // Open Graph 标签
      if (property && property.startsWith('og:')) {
        const key = property.replace('og:', '');
        metaInfo.openGraph[key] = content;
      }
      // Twitter Card 标签
      else if (name && name.startsWith('twitter:')) {
        const key = name.replace('twitter:', '');
        metaInfo.twitter[key] = content;
      }
      // 标准 Meta 标签
      else if (name) {
        const lowerName = name.toLowerCase();
        if (lowerName === 'description') {
          metaInfo.description = content;
        } else if (lowerName === 'keywords') {
          metaInfo.keywords = content;
        } else if (lowerName === 'author') {
          metaInfo.author = content;
        } else {
          // 其他 Meta 标签
          metaInfo.other[name] = content;
        }
      }
    });

    return metaInfo;
  } catch (error) {
    console.warn('提取 Meta 信息失败:', error);
    return metaInfo;
  }
}

/**
 * 从 URL 提取域名信息
 * @param {string} url - 完整URL
 * @returns {string} 清理后的域名
 */
function extractDomain(url) {
  try {
    if (!url) return '';
    
    const urlObj = new URL(url);
    let domain = urlObj.hostname;
    
    // 移除 www. 前缀
    if (domain.startsWith('www.')) {
      domain = domain.substring(4);
    }
    
    return domain;
  } catch (error) {
    // 如果 URL 解析失败，尝试简单处理
    try {
      const match = url.match(/https?:\/\/([^\/]+)/);
      if (match && match[1]) {
        return match[1].replace(/^www\./, '');
      }
    } catch (e) {
      // 忽略错误
    }
    return '';
  }
}

/**
 * 限制文本长度
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 限制后的文本
 */
function limitTextLength(text, maxLength = 3000) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  // 尝试在句号、问号、感叹号处截断
  const truncated = text.substring(0, maxLength);
  const lastPunctuation = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastPunctuation > maxLength * 0.8) {
    return truncated.substring(0, lastPunctuation + 1);
  }
  
  return truncated + '...';
}

/**
 * 清理和规范化文本
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  if (!text) return '';
  
  // 移除多余空白
  let cleaned = text.replace(/\s+/g, ' ');
  
  // 移除首尾空白
  cleaned = cleaned.trim();
  
  // 移除特殊字符（可选，根据需要调整）
  // cleaned = cleaned.replace(/[\r\n\t]/g, ' ');
  
  return cleaned;
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isElementVisible,
    extractVisibleText,
    extractMainContent,
    excludeUnnecessaryElements,
    extractMetaInfo,
    extractDomain,
    limitTextLength,
    cleanText
  };
}

// 如果在浏览器环境中，也可以挂载到全局对象（供 content.js 使用）
if (typeof window !== 'undefined') {
  window.ContentExtractor = {
    isElementVisible,
    extractVisibleText,
    extractMainContent,
    excludeUnnecessaryElements,
    extractMetaInfo,
    extractDomain,
    limitTextLength,
    cleanText
  };
}
