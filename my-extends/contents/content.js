// Content Script - 用于提取页面内容

// ==================== 消息类型常量 ====================
const MESSAGE_TYPES = {
  EXTRACT_PAGE_CONTENT: 'EXTRACT_PAGE_CONTENT',        // 提取页面内容
  PAGE_CONTENT_EXTRACTED: 'PAGE_CONTENT_EXTRACTED',    // 页面内容提取完成
  GENERATE_SMART_TAGS: 'GENERATE_SMART_TAGS'           // 生成智能标签
};

/**
 * 提取页面标题
 */
function extractTitle() {
  return document.title || '';
}

/**
 * 提取 Meta 描述
 */
function extractMetaDescription() {
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    return metaDesc.getAttribute('content') || '';
  }
  return '';
}

/**
 * 提取 Meta 关键词
 */
function extractMetaKeywords() {
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    return metaKeywords.getAttribute('content') || '';
  }
  return '';
}

/**
 * 提取 Open Graph 标签
 */
function extractOpenGraphTags() {
  const ogTags = {};
  const ogSelectors = [
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:type"]',
    'meta[property="og:url"]',
    'meta[property="og:site_name"]'
  ];

  ogSelectors.forEach(selector => {
    const meta = document.querySelector(selector);
    if (meta) {
      const property = meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (property && content) {
        // 移除 "og:" 前缀作为 key
        const key = property.replace('og:', '');
        ogTags[key] = content;
      }
    }
  });

  return ogTags;
}

/**
 * 检查元素是否可见
 */
function isElementVisible(element) {
  if (!element) return false;
  
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
}

/**
 * 提取主要文本内容
 */
function extractMainContent() {
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
    '#main-content'
  ];

  let mainContent = null;

  // 尝试按优先级查找
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && isElementVisible(element)) {
      mainContent = element;
      break;
    }
  }

  // 如果没找到，从 body 提取（排除导航、页脚等）
  if (!mainContent) {
    mainContent = document.body;
  }

  // 排除不需要的元素
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
    'script',
    'style',
    'noscript'
  ];

  // 克隆元素以避免修改原始 DOM
  const clonedContent = mainContent.cloneNode(true);

  // 移除排除的元素
  excludeSelectors.forEach(selector => {
    const elements = clonedContent.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  return clonedContent;
}

/**
 * 从元素中提取纯文本
 */
function extractTextFromElement(element) {
  if (!element) return '';
  
  // 获取所有文本节点
  let text = '';
  
  // 遍历所有文本节点
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // 跳过脚本和样式内容
        const parent = node.parentElement;
        if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let node;
  while (node = walker.nextNode()) {
    const textContent = node.textContent.trim();
    if (textContent) {
      text += textContent + ' ';
    }
  }

  // 清理多余空白
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 提取标题层级
 */
function extractHeadings() {
  const headings = [];
  const headingElements = document.querySelectorAll('h1, h2, h3');
  
  headingElements.forEach((heading, index) => {
    if (isElementVisible(heading)) {
      const text = heading.textContent.trim();
      if (text && text.length > 0) {
        headings.push({
          level: heading.tagName.toLowerCase(),
          text: text
        });
      }
    }
  });

  return headings;
}

/**
 * 提取段落文本
 */
function extractParagraphs() {
  const paragraphs = [];
  const pElements = document.querySelectorAll('p');
  
  pElements.forEach(p => {
    if (isElementVisible(p)) {
      const text = p.textContent.trim();
      // 只保留有意义的段落（至少10个字符）
      if (text && text.length >= 10) {
        paragraphs.push(text);
      }
    }
  });

  return paragraphs;
}

/**
 * 提取重要链接文本
 */
function extractImportantLinks() {
  const links = [];
  const linkElements = document.querySelectorAll('a');
  
  linkElements.forEach(link => {
    if (isElementVisible(link)) {
      const text = link.textContent.trim();
      const href = link.getAttribute('href');
      
      // 只保留有文本内容的链接
      if (text && text.length > 0 && href) {
        // 跳过锚链接和 javascript 链接
        if (!href.startsWith('#') && !href.startsWith('javascript:')) {
          links.push({
            text: text,
            href: href
          });
        }
      }
    }
  });

  // 限制链接数量，避免过多
  return links.slice(0, 20);
}

/**
 * 主函数：提取页面内容
 */
function extractPageContent() {
  try {
    const mainContentElement = extractMainContent();
    const mainText = extractTextFromElement(mainContentElement);
    
    // 限制主文本长度（优先保留前面的内容）
    const maxMainTextLength = 3000;
    const limitedMainText = mainText.length > maxMainTextLength 
      ? mainText.substring(0, maxMainTextLength) + '...'
      : mainText;

    const result = {
      title: extractTitle(),
      metaDescription: extractMetaDescription(),
      metaKeywords: extractMetaKeywords(),
      openGraph: extractOpenGraphTags(),
      mainText: limitedMainText,
      headings: extractHeadings(),
      paragraphs: extractParagraphs().slice(0, 10), // 只取前10个段落
      links: extractImportantLinks(),
      url: window.location.href,
      domain: window.location.hostname.replace('www.', '')
    };

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('提取页面内容失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理提取页面内容请求
  if (request.action === MESSAGE_TYPES.EXTRACT_PAGE_CONTENT) {
    try {
      console.log('收到提取页面内容请求');
      
      // 异步提取内容
      const result = extractPageContent();
      
      // 发送响应
      sendResponse({
        success: result.success,
        data: result.data || null,
        error: result.error || null,
        action: MESSAGE_TYPES.PAGE_CONTENT_EXTRACTED,
        timestamp: request.timestamp || Date.now()
      });
      
      return true; // 保持消息通道开放以支持异步响应
    } catch (error) {
      console.error('处理提取页面内容请求失败:', error);
      sendResponse({
        success: false,
        data: null,
        error: error.message,
        action: MESSAGE_TYPES.PAGE_CONTENT_EXTRACTED,
        timestamp: request.timestamp || Date.now()
      });
      return true;
    }
  }
  
  // 其他消息类型的处理可以在这里添加
  return false; // 不处理的消息返回 false
});

console.log('Content script loaded - 页面内容提取功能已就绪');
