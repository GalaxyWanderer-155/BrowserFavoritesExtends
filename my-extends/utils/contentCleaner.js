// 内容清洗工具模块
// 用于清洗和优化从网页提取的内容

/**
 * 移除不必要的HTML元素
 * @param {string} htmlContent - HTML内容字符串
 * @returns {string} 清洗后的HTML
 */
function removeUnnecessaryElements(htmlContent) {
  if (!htmlContent) return '';
  
  try {
    // 创建临时DOM容器来解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // 要删除的选择器列表
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'object',
      'embed',
      'audio',
      'video',
      'canvas',
      'svg',
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
      '[id*="advertisement"]',
      '.social-share',
      '.share-buttons',
      '.comments',
      '.comment',
      '.related-posts',
      '.related-articles',
      '.breadcrumb',
      '.pagination',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '[role="complementary"]'
    ];

    // 移除匹配的元素
    removeSelectors.forEach(selector => {
      try {
        const elements = tempDiv.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // 选择器可能无效，继续处理
      }
    });

    // 移除注释
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_COMMENT,
      null,
      false
    );

    const comments = [];
    let node;
    while (node = walker.nextNode()) {
      comments.push(node);
    }
    comments.forEach(comment => comment.remove());

    return tempDiv.innerHTML;
  } catch (error) {
    console.warn('移除不必要元素失败:', error);
    return htmlContent;
  }
}

/**
 * 提取文本内容（从HTML中提取纯文本）
 * @param {string} htmlContent - HTML内容
 * @param {Object} options - 选项配置
 * @returns {string} 提取的文本内容
 */
function extractTextContent(htmlContent, options = {}) {
  if (!htmlContent) return '';
  
  const {
    minTextLength = 3,  // 最小文本长度
    preserveStructure = false,  // 是否保留结构（段落、换行等）
    maxParagraphs = null  // 最大段落数
  } = options;

  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    let text = '';

    if (preserveStructure) {
      // 保留结构的方式提取
      const paragraphs = tempDiv.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6');
      let paragraphCount = 0;
      
      paragraphs.forEach((para, index) => {
        if (maxParagraphs && paragraphCount >= maxParagraphs) return;
        
        const paraText = para.textContent.trim();
        if (paraText && paraText.length >= minTextLength) {
          text += paraText + '\n\n';
          paragraphCount++;
        }
      });
    } else {
      // 简单提取所有文本
      const walker = document.createTreeWalker(
        tempDiv,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (parent) {
              const tagName = parent.tagName.toUpperCase();
              if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
                return NodeFilter.FILTER_REJECT;
              }
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        },
        false
      );

      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (text && text.length >= minTextLength) {
          textNodes.push(text);
        }
      }

      // 合并文本节点
      text = textNodes.join(' ');
    }

    // 清理多余空白
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  } catch (error) {
    console.warn('提取文本内容失败:', error);
    return '';
  }
}

/**
 * 限制内容长度（优先级提取）
 * @param {Object} contentData - 内容数据对象
 * @param {number} maxLength - 最大长度（字符数）
 * @returns {Object} 限制后的内容数据
 */
function limitContentLength(contentData, maxLength = 3000) {
  if (!contentData) return contentData;

  const {
    title = '',
    description = '',
    mainText = '',
    headings = [],
    paragraphs = []
  } = contentData;

  // 计算已使用的长度
  let usedLength = 0;
  const result = {
    title: title,
    description: description,
    mainText: '',
    headings: [],
    paragraphs: []
  };

  // 优先级1: 标题和描述（必须包含）
  usedLength += (title || '').length;
  usedLength += (description || '').length;
  
  const remainingLength = maxLength - usedLength - 100; // 留100字符缓冲

  if (remainingLength <= 0) {
    return result;
  }

  // 优先级2: 主要标题（h1, h2）
  const importantHeadings = headings.filter(h => h.level === 'h1' || h.level === 'h2');
  for (const heading of importantHeadings) {
    const headingText = heading.text || '';
    if (usedLength + headingText.length <= remainingLength) {
      result.headings.push(heading);
      usedLength += headingText.length;
    } else {
      break;
    }
  }

  // 优先级3: 主要内容文本的前部分
  if (mainText && usedLength < remainingLength) {
    const availableLength = remainingLength - usedLength;
    result.mainText = mainText.substring(0, availableLength);
    
    // 尝试在句号处截断
    const lastPunctuation = Math.max(
      result.mainText.lastIndexOf('。'),
      result.mainText.lastIndexOf('！'),
      result.mainText.lastIndexOf('？'),
      result.mainText.lastIndexOf('.'),
      result.mainText.lastIndexOf('!'),
      result.mainText.lastIndexOf('?')
    );
    
    if (lastPunctuation > availableLength * 0.8) {
      result.mainText = result.mainText.substring(0, lastPunctuation + 1);
    } else {
      result.mainText += '...';
    }
    
    usedLength += result.mainText.length;
  }

  // 优先级4: 前几个段落
  if (paragraphs && paragraphs.length > 0 && usedLength < remainingLength) {
    const availableLength = remainingLength - usedLength;
    let paragraphsText = '';
    
    for (const para of paragraphs) {
      if (paragraphsText.length + para.length <= availableLength) {
        paragraphsText += para + ' ';
      } else {
        break;
      }
    }
    
    if (paragraphsText) {
      result.paragraphs = paragraphsText.trim().split(/\s+/).map((p, i, arr) => {
        // 这里简化处理，实际应该保留原始段落
        return p;
      });
    }
  }

  return result;
}

/**
 * 结构化内容（保留段落、标题层级等结构）
 * @param {string} htmlContent - HTML内容
 * @returns {Object} 结构化的内容对象
 */
function structureContent(htmlContent) {
  if (!htmlContent) {
    return {
      headings: [],
      paragraphs: [],
      lists: []
    };
  }

  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    const result = {
      headings: [],
      paragraphs: [],
      lists: []
    };

    // 提取标题（h1-h6）
    const headingElements = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headingElements.forEach(heading => {
      const text = heading.textContent.trim();
      if (text && text.length > 0) {
        result.headings.push({
          level: heading.tagName.toLowerCase(),
          text: text,
          order: result.headings.length
        });
      }
    });

    // 提取段落
    const paragraphElements = tempDiv.querySelectorAll('p');
    paragraphElements.forEach(p => {
      const text = p.textContent.trim();
      // 只保留有意义的段落（至少10个字符）
      if (text && text.length >= 10) {
        result.paragraphs.push({
          text: text,
          order: result.paragraphs.length
        });
      }
    });

    // 提取列表项
    const listElements = tempDiv.querySelectorAll('ul, ol');
    listElements.forEach(list => {
      const items = [];
      const listItems = list.querySelectorAll('li');
      
      listItems.forEach(li => {
        const text = li.textContent.trim();
        if (text && text.length > 0) {
          items.push({
            text: text,
            order: items.length
          });
        }
      });

      if (items.length > 0) {
        result.lists.push({
          type: list.tagName.toLowerCase(), // 'ul' or 'ol'
          items: items
        });
      }
    });

    return result;
  } catch (error) {
    console.warn('结构化内容失败:', error);
    return {
      headings: [],
      paragraphs: [],
      lists: []
    };
  }
}

/**
 * 清理和规范化文本
 * @param {string} text - 原始文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  if (!text) return '';
  
  try {
    // 移除多余空白
    let cleaned = text.replace(/\s+/g, ' ');
    
    // 移除首尾空白
    cleaned = cleaned.trim();
    
    // 移除控制字符（保留常见标点）
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 规范化换行符
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');
    
    return cleaned;
  } catch (error) {
    console.warn('清理文本失败:', error);
    return text;
  }
}

/**
 * 主函数：清洗内容
 * @param {Object} rawContent - 原始内容对象（从 content.js 获取）
 * @returns {Object} 清洗后的结构化内容对象
 */
function cleanContent(rawContent) {
  if (!rawContent) {
    return {
      success: false,
      error: '内容为空'
    };
  }

  try {
    // 提取基础信息
    const cleaned = {
      title: cleanText(rawContent.title || ''),
      metaDescription: cleanText(rawContent.metaDescription || ''),
      metaKeywords: cleanText(rawContent.metaKeywords || ''),
      openGraph: rawContent.openGraph || {},
      url: rawContent.url || '',
      domain: rawContent.domain || ''
    };

    // 清洗主要文本内容
    let mainText = cleanText(rawContent.mainText || '');
    
    // 如果原始数据中有 HTML，先移除不必要元素
    if (rawContent.htmlContent) {
      const cleanedHtml = removeUnnecessaryElements(rawContent.htmlContent);
      const extractedText = extractTextContent(cleanedHtml, {
        minTextLength: 3,
        preserveStructure: false
      });
      if (extractedText) {
        mainText = extractedText;
      }
    }

    cleaned.mainText = mainText;

    // 提取结构化内容（标题、段落、列表）
    const structured = structureContent(rawContent.htmlContent || '');
    cleaned.headings = structured.headings || rawContent.headings || [];
    cleaned.paragraphs = structured.paragraphs || rawContent.paragraphs || [];
    cleaned.lists = structured.lists || [];

    // 如果原始数据中已有这些信息，使用原始数据
    if (rawContent.headings && rawContent.headings.length > 0) {
      cleaned.headings = rawContent.headings.map(h => ({
        level: h.level || 'h1',
        text: cleanText(h.text || ''),
        order: h.order || 0
      }));
    }

    if (rawContent.paragraphs && rawContent.paragraphs.length > 0) {
      cleaned.paragraphs = rawContent.paragraphs.map((p, index) => ({
        text: cleanText(typeof p === 'string' ? p : p.text || ''),
        order: index
      }));
    }

    // 限制内容长度（优先级提取）
    const limited = limitContentLength({
      title: cleaned.title,
      description: cleaned.metaDescription,
      mainText: cleaned.mainText,
      headings: cleaned.headings,
      paragraphs: cleaned.paragraphs
    }, 3000);

    cleaned.mainText = limited.mainText || cleaned.mainText;
    cleaned.headings = limited.headings || cleaned.headings;
    cleaned.paragraphs = limited.paragraphs || cleaned.paragraphs;

    // 构建最终的结构化内容
    const result = {
      success: true,
      data: {
        title: cleaned.title,
        description: cleaned.metaDescription,
        keywords: cleaned.metaKeywords,
        openGraph: cleaned.openGraph,
        domain: cleaned.domain,
        url: cleaned.url,
        content: cleaned.mainText,
        headings: cleaned.headings,
        paragraphs: cleaned.paragraphs.map(p => typeof p === 'string' ? p : p.text),
        lists: cleaned.lists
      }
    };

    return result;
  } catch (error) {
    console.error('清洗内容失败:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

// 导出函数（如果使用模块系统）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    removeUnnecessaryElements,
    extractTextContent,
    limitContentLength,
    structureContent,
    cleanText,
    cleanContent
  };
}

// 如果在浏览器环境中，也可以挂载到全局对象
if (typeof window !== 'undefined') {
  window.ContentCleaner = {
    removeUnnecessaryElements,
    extractTextContent,
    limitContentLength,
    structureContent,
    cleanText,
    cleanContent
  };
}
