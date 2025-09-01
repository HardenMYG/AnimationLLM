// 打开Live2D界面 - 智能跳转
function openLive2D() {
    console.log('openLive2D函数被调用 - 检查Live2D服务器状态');
    
    // 添加点击动画效果
    const button = document.querySelector('.live2d-button');
    
    
    // 检查Live2D服务器是否运行
    fetch('http://localhost:5000', { 
        mode: 'no-cors',
        timeout: 3000 
    })
    .then(() => {
        // 服务器正常运行，直接跳转
        console.log('Live2D服务器正常运行，准备跳转');
        
        setTimeout(() => {
            window.location.href = 'http://localhost:5000';
        }, 500);
    })
    .catch(() => {
        // 服务器未运行，显示提示并跳转到状态页面
        console.log('Live2D服务器未运行，跳转到状态页面');
        if (button) {
            button.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 服务器未启动';
            button.style.background = '#ff9800';
        }
        
        
    });
}


// 用户信息模态框相关逻辑
let userInfo = {
    username: '',
    email: '',
    favorites: []
};

async function fetchUserInfo() {
    try {
        const res = await fetch('/api/userinfo');
        if (!res.ok) throw new Error('未登录或获取失败');
        const data = await res.json();
        userInfo.username = data.username || '';
        userInfo.email = data.email || '';
        userInfo.favorites = Array.isArray(data.favorites) ? data.favorites : [];
    } catch (e) {
        userInfo = { username: '未登录', email: '', favorites: [] };
    }
}

async function openUserInfoModal() {
    await fetchUserInfo();
    document.getElementById('modalUsername').textContent = userInfo.username;
    document.getElementById('modalEmail').textContent = userInfo.email || '(未设置)';
    renderFavoriteList();
    document.getElementById('userInfoModal').style.display = 'block';
}

function closeUserInfoModal() {
    document.getElementById('userInfoModal').style.display = 'none';
}

function renderFavoriteList() {
    const ul = document.getElementById('favoriteList');
    ul.innerHTML = '';
    if (userInfo.favorites.length === 0) {
        ul.innerHTML = '<li style="color:#888;">暂无喜欢的作品</li>';
        return;
    }
    userInfo.favorites.forEach((item, idx) => {
        const li = document.createElement('li');
        li.textContent = item;
        // 删除按钮
        const delBtn = document.createElement('button');
        delBtn.textContent = '移除';
        delBtn.style.marginLeft = '8px';
        delBtn.style.background = '#ff6b6b';
        delBtn.style.color = '#fff';
        delBtn.style.border = 'none';
        delBtn.style.borderRadius = '3px';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontSize = '12px';
        delBtn.onclick = function() {
            removeFavorite(idx);
        };
        li.appendChild(delBtn);
        ul.appendChild(li);
    });
}

async function addFavorite() {
    const input = document.getElementById('favoriteInput');
    const value = input.value.trim();
    if (!value) return;
    if (userInfo.favorites.includes(value)) {
        alert('已添加过该作品');
        return;
    }
    userInfo.favorites.push(value);
    await updateFavorites();
    renderFavoriteList();
    input.value = '';
}

async function removeFavorite(idx) {
    userInfo.favorites.splice(idx, 1);
    await updateFavorites();
    renderFavoriteList();
}

async function updateFavorites() {
    // 更新喜欢的作品到后端
    try {
        await fetch('/api/userinfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorites: userInfo.favorites })
        });
    } catch (e) {}
}
// 全局变量
let isAIResponding = false;
let currentConversationId = null;
let conversations = [];
let isSidebarOpen = true;
let headerTimeout = null;


// DOM元素
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');



// 全局变量存储当前图片数据
let currentImage = null;

// 修改后的 handleImageUpload 函数
function handleImageUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 创建预览
        const reader = new FileReader();
        reader.onload = function(event) {
        // 显示预览
        const preview = document.getElementById('imagePreview');
        preview.src = event.target.result;
        
        // 显示预览容器
        const container = document.getElementById('imagePreviewContainer');
        container.style.display = 'flex';
        
        // 存储图片数据
        currentImage = {
            file: file,
            dataURL: event.target.result
        };
        
        // 滚动到底部
        scrollToBottom();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// 清除预览
function clearImagePreview() {
  const container = document.getElementById('imagePreviewContainer');
  container.style.display = 'none';
  currentImage = null;
}

// sendUserMessage 函数
function sendUserMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message && !currentImage) {
        showToast('请输入消息或上传图片', 'warning');
        return;
    }

    // 清空输入框
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // 如果有图片，先上传图片
    if (currentImage) {
        // 添加用户消息（带图片预览）
        addUserMessage(message || '查看图片', true);

        // 上传图片到服务器
        uploadImageToServer(currentImage.file, function(tempPath) {
            if (tempPath) {
                // 图片上传完成后发送聊天请求
                sendMessageWithImage(message, tempPath);

                // 清除预览
                clearImagePreview();
            } else {
                showToast('图片上传失败，无法发送带图片的消息', 'error');
            }
        });
    } else {
        // 没有图片，直接发送文本消息
        sendMessage(message);
    }
}

function uploadImageToServer(file, callback) {
    showToast('正在上传图片...', 'info');
    
    const formData = new FormData();
    formData.append('image', file);
    
    fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
        // 使用正确的字段名
        if (data.image_path) {
            callback(data.image_path);
        } else {
            console.error('Upload response missing image_path:', data);
            showToast('上传失败: 服务器响应格式错误', 'error');
            sendMessage(message || '我上传了一张图片');
        }
        } else {
        showToast(`上传失败: ${data.error}`, 'error');
        // 即使上传失败，也发送文本消息
        sendMessage(message || '我上传了一张图片');
        }
    })
    .catch(error => {
        console.error('上传错误:', error);
        showToast('图片上传失败', 'error');
        // 发送文本消息
        sendMessage(message || '我上传了一张图片');
    });
}


function sendMessageWithImage(message, imagePath) {
    console.log("发送带图片的消息:", message, "图片路径:", imagePath);
    // 显示AI思考状态
    showAIThinking();

    // 确保正确发送图片路径
    const requestData = {
        message: message || "分析图片内容",
        image_path: imagePath,  // 确保字段名与后端一致
        conversation_id: currentConversationId,
    };

    console.log("Sending message with image:", requestData);  // 调试日志

    // 发送请求
    fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestData),
    })
    .then(response => response.json())
    .then(data => {
        removeAIThinking();

        if (data.error) {
            addAIMessage('抱歉，我现在有点累了，请稍后再试~', false);
        } else {
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
            }
            addAIMessage(data.response, true);
            loadConversations();
            showSuccessMessage('回复生成成功！');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        removeAIThinking();
        showErrorMessage('连接失败，正在使用模拟回复');
        setTimeout(() => {
            showSimulatedResponse(message);
        }, 1000);
    });
}

// 初始化自动隐藏header
function initAutoHideHeader() {
    const header = document.getElementById('chatHeader');
    const triggerZone = document.getElementById('headerTriggerZone');
    const body = document.body;
    let isMouseInTopArea = false;
    
    if (!header || !triggerZone) {
        console.log('Header or trigger zone not found');
        return;
    }
    
    // 添加聊天页面body类
    body.classList.add('chat-page');
    
    // 初始状态：默认隐藏header
    header.classList.remove('show');
    body.classList.add('header-hidden');
    
    // 显示header的函数
    function showHeader() {
        clearTimeout(headerTimeout);
        header.classList.add('show');
        body.classList.remove('header-hidden');
    }
    
    // 隐藏header的函数
    function hideHeader(delay = 200) {
        clearTimeout(headerTimeout);
        headerTimeout = setTimeout(() => {
            header.classList.remove('show');
            body.classList.add('header-hidden');
        }, delay);
    }
    
    // 鼠标进入触发区域时显示header
    triggerZone.addEventListener('mouseenter', () => {
        isMouseInTopArea = true;
        showHeader();
    });
    
    // 鼠标离开触发区域时隐藏header
    triggerZone.addEventListener('mouseleave', () => {
        isMouseInTopArea = false;
        hideHeader(100); // 更快的隐藏
    });
    
    // 鼠标进入header时保持显示
    header.addEventListener('mouseenter', () => {
        showHeader();
    });
    
    // 鼠标离开header时隐藏
    header.addEventListener('mouseleave', () => {
        hideHeader(100);
    });
    
    // 使用更频繁的鼠标移动监听
    let mouseMoveTimeout;
    document.addEventListener('mousemove', (e) => {
        // 使用requestAnimationFrame来优化性能
        if (mouseMoveTimeout) clearTimeout(mouseMoveTimeout);
        mouseMoveTimeout = setTimeout(() => {
            if (e.clientY <= 60) { // 更小的触发区域，更快响应
                if (!isMouseInTopArea) {
                    isMouseInTopArea = true;
                    showHeader();
                }
            } else if (e.clientY > 100) { // 更快的隐藏触发
                if (isMouseInTopArea) {
                    isMouseInTopArea = false;
                    hideHeader(150);
                }
            }
        }, 10); // 极小的延迟，几乎实时响应
    });
}

// 初始化卡片切换功能
function initializeCardSwitcher() {
    const cardStack = document.getElementById('cardStack');
    if (!cardStack) {
        console.log('Card stack not found');
        return;
    }
    
    const cards = cardStack.querySelectorAll('.preview-card');
    if (cards.length === 0) {
        console.log('No cards found');
        return;
    }
    
    let currentCardIndex = 0;
    let hoverInterval = null;

    console.log('Initializing card switcher with', cards.length, 'cards');

    // 设置初始状态 - 只显示第一张卡片
    cards.forEach((card, index) => {
        if (index === 0) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    // 卡片切换函数
    function switchToCard(index) {
        if (index === currentCardIndex) return;
        
        console.log('Switching from card', currentCardIndex, 'to card', index);
        
        // 移除当前活跃卡片
        cards[currentCardIndex].classList.remove('active');
        
        // 激活新卡片
        cards[index].classList.add('active');
        
        currentCardIndex = index;
    }

    // 鼠标悬停时开始循环切换
    cardStack.addEventListener('mouseenter', function() {
        console.log('Mouse entered card stack');
        
        // 立即切换到下一张卡片
        const nextIndex = (currentCardIndex + 1) % cards.length;
        switchToCard(nextIndex);
        
        // 开始定时切换
        hoverInterval = setInterval(function() {
            const nextIndex = (currentCardIndex + 1) % cards.length;
            switchToCard(nextIndex);
        }, 2000); // 每2秒切换一次
    });

    // 鼠标离开时停止切换，回到第一张卡片
    cardStack.addEventListener('mouseleave', function() {
        console.log('Mouse left card stack');
        
        if (hoverInterval) {
            clearInterval(hoverInterval);
            hoverInterval = null;
        }
        
        // 延迟一点时间后回到第一张卡片
        setTimeout(function() {
            switchToCard(0);
        }, 500);
    });

    // 点击切换到下一张卡片
    cardStack.addEventListener('click', function() {
        const nextIndex = (currentCardIndex + 1) % cards.length;
        switchToCard(nextIndex);
    });
}

// 检查用户登录状态
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/user', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const userData = await response.json();
            // 显示用户信息
            document.getElementById('username').textContent = userData.username;
            document.getElementById('sidebarUsername').textContent = userData.username;
            document.getElementById('userInfo').style.display = 'flex';
            
            // 加载对话历史
            await loadConversations();
            
            return true;
        } else {
            // 如果未登录，重定向到登录页
            window.location.href = '/动态背景-萌次元.html';
            return false;
        }
    } catch (error) {
        console.error('检查登录状态失败:', error);
        window.location.href = '/动态背景-萌次元.html';
        return false;
    }
}

// 用户退出登录
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            const result = await response.json();
            // 退出成功，重定向到登录界面
            window.location.href = result.redirect || '/';
        } else {
            console.error('退出失败');
            // 即使失败也跳转到根路径，会显示登录界面
            window.location.href = '/';
        }
    } catch (error) {
        console.error('退出请求失败:', error);
        // 即使请求失败也强制跳转到根路径
        window.location.href = '/';
    }
}

// 回到发现页面
function goToDiscover() {
    window.location.href = '/discover';
}

// 侧栏管理
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const mainContent = document.querySelector('.main-content');
    const expandBtn = document.getElementById('sidebarExpandBtn');
    
    if (window.innerWidth <= 768) {
        // 移动端模式
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    } else {
        // 桌面端模式
        sidebar.classList.toggle('collapsed');
        isSidebarOpen = !sidebar.classList.contains('collapsed');
        
        if (isSidebarOpen) {
            // 侧边栏展开状态
            mainContent.style.marginLeft = '280px';
            expandBtn.style.display = 'none';
        } else {
            // 侧边栏折叠状态
            mainContent.style.marginLeft = '0px';
            expandBtn.style.display = 'block';
        }
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// 初始化侧边栏状态
function initializeSidebar() {
    const expandBtn = document.getElementById('sidebarExpandBtn');
    const mainContent = document.querySelector('.main-content');
    
    // 确保初始状态正确
    if (window.innerWidth > 768) {
        if (isSidebarOpen) {
            mainContent.style.marginLeft = '280px';
            expandBtn.style.display = 'none';
        } else {
            mainContent.style.marginLeft = '0px';
            expandBtn.style.display = 'block';
        }
    }
    
    // 监听窗口大小变化
    window.addEventListener('resize', function() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (window.innerWidth <= 768) {
            // 移动端模式
            mainContent.style.marginLeft = '0';
            expandBtn.style.display = 'none';
            sidebar.classList.remove('collapsed');
        } else {
            // 桌面端模式
            overlay.classList.remove('active');
            sidebar.classList.remove('open');
            
            if (isSidebarOpen) {
                mainContent.style.marginLeft = '280px';
                expandBtn.style.display = 'none';
            } else {
                mainContent.style.marginLeft = '0px';
                expandBtn.style.display = 'block';
            }
        }
    });
}

// 对话管理
async function loadConversations() {
    try {
        const response = await fetch('/api/conversations', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            conversations = data.conversations || [];
            renderConversationList();
        } else {
            console.error('加载对话历史失败');
            // 即使失败也要清除加载状态
            conversations = [];
            renderConversationList();
        }
    } catch (error) {
        console.error('加载对话历史错误:', error);
        // 即使出错也要清除加载状态
        conversations = [];
        renderConversationList();
    }
}

function renderConversationList() {
    const conversationList = document.getElementById('conversationList');
    
    if (conversations.length === 0) {
        conversationList.innerHTML = `
            <div class="no-conversations">
                <i class="fas fa-comments"></i>
                <p>还没有对话历史</p>
                <p>点击"新建对话"开始聊天</p>
            </div>
        `;
        return;
    }
    
    const conversationItems = conversations.map(conv => {
        const isActive = conv.id === currentConversationId;
        const time = formatTime(conv.updated_at);
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 onclick="loadConversation('${conv.id}')">
                <div class="conversation-title">${conv.title}</div>
                <div class="conversation-meta">
                    <span class="conversation-time">${time}</span>
                    <div class="conversation-actions">
                        <button class="conversation-action-btn" 
                                onclick="event.stopPropagation(); deleteConversation('${conv.id}')"
                                title="删除对话">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    conversationList.innerHTML = conversationItems;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
        return '刚刚';
    } else if (diff < 3600000) { // 1小时内
        return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 24小时内
        return `${Math.floor(diff / 3600000)}小时前`;
    } else if (diff < 604800000) { // 7天内
        return `${Math.floor(diff / 86400000)}天前`;
    } else {
        return date.toLocaleDateString();
    }
}

async function createNewConversation() {
    try {
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                title: '新对话'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            currentConversationId = data.conversation_id;
            
            // 清空当前聊天
            clearChatMessages();
            showWelcomeMessage();
            
            // 确保切换到聊天界面
            showSection('chat');
            
            // 重新加载对话列表
            await loadConversations();
        } else {
            console.error('创建对话失败');
        }
    } catch (error) {
        console.error('创建对话错误:', error);
    }
}

async function loadConversation(conversationId) {
    console.log('加载对话:', conversationId);
    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('获取到对话数据:', data);
            const conversation = data.conversation;
            currentConversationId = conversationId;
            
            // 清空当前聊天
            clearChatMessages();
            
            // 确保切换到聊天界面
            showSection('chat');
            
            // 加载消息历史
            if (conversation.messages && conversation.messages.length > 0) {
                console.log('加载消息数量:', conversation.messages.length);
                conversation.messages.forEach((msg, index) => {
                    console.log(`消息 ${index}:`, msg);
                    if (msg.type === 'user') {
                        addUserMessage(msg.content);
                    } else if (msg.type === 'ai') {
                        addAIMessage(msg.content);
                    }
                });
            } else {
                console.log('没有历史消息，显示欢迎信息');
                showWelcomeMessage();
            }
            
            // 更新对话列表显示
            renderConversationList();
            
            // 移动端关闭侧栏
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        } else {
            console.error('加载对话失败，状态码:', response.status);
            const errorData = await response.text();
            console.error('错误信息:', errorData);
        }
    } catch (error) {
        console.error('加载对话错误:', error);
    }
}

async function deleteConversation(conversationId) {
    if (!confirm('确定要删除这个对话吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/conversations/${conversationId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            // 如果删除的是当前对话，清空聊天
            if (conversationId === currentConversationId) {
                currentConversationId = null;
                clearChatMessages();
                showWelcomeMessage();
            }
            
            // 重新加载对话列表
            await loadConversations();
        } else {
            console.error('删除对话失败');
        }
    } catch (error) {
        console.error('删除对话错误:', error);
    }
}

function clearCurrentChat() {
    currentConversationId = null;
    clearChatMessages();
    showWelcomeMessage();
    renderConversationList();
}

function clearChatMessages() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
}

// 显示指定的页面部分
function showSection(sectionId) {
    // 隐藏所有section
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    // 显示指定的section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
}

function showWelcomeMessage() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = `
        <div class="welcome-message" id="welcomeMessage">
            <div class="message ai-message">
                <div class="message-avatar">
                    <img src="生成二次元Logo头像.png" alt="AI">
                </div>
                <div class="message-content">
                    <p>👋 你好！我是你的专属动漫推荐AI助手</p>
                    <p>📚 我拥有 <strong>454部动漫作品</strong> 的详细信息，包括制作公司、类型、评分等</p>
                    <p>💫 告诉我你的喜好，我会为你推荐最适合的番剧！</p>
                    <div class="quick-suggestions">
                        <button class="suggestion-btn" onclick="sendMessage('推荐一些热血动漫')">
                            🔥 热血动漫
                        </button>
                        <button class="suggestion-btn" onclick="sendMessage('有什么好看的恋爱番吗')">
                            💕 恋爱番剧
                        </button>
                        <button class="suggestion-btn" onclick="sendMessage('推荐ufotable制作的动漫')">
                            🏢 制作公司
                        </button>
                        <button class="suggestion-btn" onclick="sendMessage('2023年有什么好动漫')">
                            � 按年份
                        </button>
                    </div>
                    <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
                </div>
            </div>
        </div>
    `;
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 首先检查登录状态
    checkAuthStatus().then(isLoggedIn => {
        if (!isLoggedIn) {
            // 如果未登录，重定向到登录页面
            window.location.href = '/';
            return;
        }
        
        // 如果已登录，继续初始化页面
        // 初始化侧边栏状态
        initializeSidebar();
        
        // 初始化自动隐藏header
        initAutoHideHeader();
        
        // 初始化卡片切换功能
        initializeCardSwitcher();
        
        // 为所有锚点添加平滑滚动
        const anchors = document.querySelectorAll('a[href^="#"]');
        anchors.forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // 聊天输入框事件
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            // 输入框自动聚焦
            chatInput.focus();
            
            // 输入框自适应高度
            chatInput.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 150) + 'px';
            });

            chatInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
        }

        // 发送按钮点击事件
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', handleSendMessage);
        }

        // 语音和附件按钮事件
        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', function() {
                showToast('语音功能开发中...', 'info');
            });
        }

        const attachBtn = document.getElementById('attachBtn');
        if (attachBtn) {
            attachBtn.addEventListener('click', function() {
                showToast('文件上传功能开发中...', 'info');
            });
        }

        // 添加鼠标跟随效果
        addMouseFollowEffect();

        // 显示欢迎消息
        showWelcomeMessage();

        // // 添加图像上传按钮
        // const imageBtn = document.createElement('button');
        // imageBtn.className = 'action-btn';
        // imageBtn.title = '上传图片';
        // imageBtn.innerHTML = '<i class="fas fa-image"></i>';
        // imageBtn.onclick = handleImageUpload;
        
        // const inputWrapper = document.querySelector('.input-wrapper');
        // if (inputWrapper) {
        //     inputWrapper.insertBefore(imageBtn, inputWrapper.querySelector('.send-btn'));
        // }
    });
});

// 消息处理
function handleSendMessage() {
    if (isAIResponding) return;
    
    sendUserMessage();
}

// 发送消息（通用函数，支持快速建议按钮）
function sendMessage(message) {
    if (isAIResponding) return;
    
    // 隐藏欢迎消息
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
    }
    
    // 添加用户消息到界面
    addUserMessage(message);
    
    // 显示AI思考状态
    showAIThinking();
    
    // 发送消息到后端
    sendToAI(message);
}

// function sendUserMessage() {
//     const chatInput = document.getElementById('chatInput');
//     const message = chatInput.value.trim();
    
//     if (!message) return;
    
//     // 清空输入框
//     chatInput.value = '';
//     chatInput.style.height = 'auto';
    
//     // 使用通用sendMessage函数
//     sendMessage(message);
// }

async function sendToAI(message) {
    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                message: message,
                conversation_id: currentConversationId
            }),
        });

        const data = await response.json();
        
        // 移除思考状态
        removeAIThinking();
        
        if (data.error) {
            addAIMessage('抱歉，我现在有点累了，请稍后再试~', false); // 错误消息不使用打字机效果
        } else {
            // 更新当前对话ID
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
            }
            
            addAIMessage(data.response, true); // 新回复使用打字机效果
            
            // 重新加载对话列表以更新标题和时间
            await loadConversations();
            
            showSuccessMessage('回复生成成功！');
        }
    } catch (error) {
        console.error('Error:', error);
        removeAIThinking();
        
        // 显示错误提示
        showErrorMessage('连接失败，正在使用模拟回复');
        
        // 显示模拟响应
        setTimeout(() => {
            showSimulatedResponse(message);
        }, 1000);
    }
}

// 显示模拟响应
function showSimulatedResponse(userMessage) {
    const responses = [
        "根据你的问题，我推荐《进击的巨人》，这是一部充满悬疑和震撼的作品！",
        "你可能会喜欢《鬼灭之刃》，精美的画面和感人的故事一定不会让你失望。",
        "《你的名字》是一部优秀的动画电影，讲述了关于命运和爱情的美丽故事。",
        "《死神》是一部经典的热血番，如果你喜欢战斗类型的动漫，这个很不错！",
        "《千与千寻》是宫崎骏的经典作品，奇幻的世界观和深刻的寓意值得一看。"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    addAIMessage(randomResponse, true); // 模拟响应也使用打字机效果
}

// 修改 addUserMessage 函数以支持图片显示
function addUserMessage(message, hasImage = false) {
  const chatMessages = document.getElementById('chatMessages');
  const messageElement = document.createElement('div');
  messageElement.className = 'message user-message';
  
  let messageContent = `<div class="message-avatar">
      <div class="user-avatar-icon">👤</div>
  </div>
  <div class="message-content">
      <div class="message-text">${formatMessage(message)}</div>`;
  
  // 如果有图片，添加图片预览
  if (hasImage && currentImage) {
    messageContent += `<div class="image-preview-container">
        <img src="${currentImage.dataURL}" class="user-image-preview uniform-image-size">
    </div>`;
  }
  
  
  messageContent += `
      <div class="message-time">${getCurrentTime()}</div>
      <div class="message-status">
          <div class="status-icon status-sent"></div>
          <span>已发送</span>
      </div>
  </div>`;
  
  messageElement.innerHTML = messageContent;
  chatMessages.appendChild(messageElement);
  
  // 模拟消息状态变化
  setTimeout(() => {
    const statusIcon = messageElement.querySelector('.status-icon');
    const statusText = messageElement.querySelector('.message-status span');
    if (statusIcon && statusText) {
      statusIcon.className = 'status-icon status-delivered';
      statusText.textContent = '已送达';
    }
  }, 500);
  
  scrollToBottom();
}


function addAIMessage(message, useTypewriter = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message ai-message';
    messageElement.innerHTML = `
        <div class="message-avatar">
            <img src="生成二次元Logo头像.png" alt="AI" onerror="this.innerHTML='🤖'">
        </div>
        <div class="message-content">
            <div class="ai-response">${useTypewriter ? '' : formatMessage(message)}</div>
            <div class="message-time">${getCurrentTime()}</div>
            <div class="message-actions">
                <button class="action-btn" onclick="copyMessage(this)" title="复制">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="action-btn" onclick="likeMessage(this)" title="点赞">
                    <i class="far fa-thumbs-up"></i>
                </button>
                <button class="action-btn" onclick="dislikeMessage(this)" title="不喜欢">
                    <i class="far fa-thumbs-down"></i>
                </button>
                <button class="action-btn" onclick="regenerateResponse(this)" title="重新生成">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="action-btn" onclick="shareMessage(this)" title="分享">
                    <i class="fas fa-share"></i>
                </button>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageElement);
    
    // 只有在需要时才使用打字机效果
    if (useTypewriter) {
        const responseContainer = messageElement.querySelector('.ai-response');
        typeWriterEffect(responseContainer, message);
    }
    
    scrollToBottom();
}

// 显示AI正在思考的状态
function showAIThinking() {
    isAIResponding = true;
    const chatMessages = document.getElementById('chatMessages');
    
    const thinkingElement = document.createElement('div');
    thinkingElement.className = 'message ai-message thinking-message';
    thinkingElement.innerHTML = `
        <div class="message-avatar">
            <div class="ai-avatar-icon">🤖</div>
        </div>
        <div class="message-content">
            <div class="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <div class="thinking-text">正在思考中...</div>
        </div>
    `;
    
    chatMessages.appendChild(thinkingElement);
    scrollToBottom();
}

function removeAIThinking() {
    isAIResponding = false;
    const thinkingMessage = document.querySelector('.thinking-message');
    if (thinkingMessage) {
        thinkingMessage.remove();
    }
}

function typeWriterEffect(element, text) {
    element.innerHTML = '';
    let index = 0;
    const speed = 30;
    
    function type() {
        if (index < text.length) {
            element.innerHTML = formatMessage(text.substring(0, index + 1));
            index++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

function formatMessage(message) {
    // 配置marked.js选项
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function(code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {}
                }
                return code;
            }
        });
        
        // 使用marked.js解析markdown
        try {
            return '<div class="markdown-body">' + marked.parse(message) + '</div>';
        } catch (error) {
            console.warn('Markdown parsing error:', error);
            // 如果marked.js解析失败，返回原始文本
            return '<div class="markdown-body"><p>' + message.replace(/\n/g, '<br>') + '</p></div>';
        }
    } else {
        // 如果marked.js未加载，使用简单的文本处理
        console.warn('Marked.js not loaded, using simple text formatting');
        return '<div class="markdown-body"><p>' + message.replace(/\n/g, '<br>') + '</p></div>';
    }
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
}

// 消息操作函数
function copyMessage(button) {
    const messageText = button.closest('.message-content').querySelector('.ai-response, .message-text').textContent;
    navigator.clipboard.writeText(messageText).then(() => {
        const icon = button.querySelector('i');
        icon.className = 'fas fa-check';
        setTimeout(() => {
            icon.className = 'fas fa-copy';
        }, 2000);
        showToast('消息已复制到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

// 点赞消息
function likeMessage(button) {
    const icon = button.querySelector('i');
    if (icon.className.includes('far')) {
        icon.className = 'fas fa-thumbs-up';
        button.classList.add('liked');
        showToast('感谢你的反馈！', 'success');
    } else {
        icon.className = 'far fa-thumbs-up';
        button.classList.remove('liked');
    }
}

// 不喜欢消息
function dislikeMessage(button) {
    const icon = button.querySelector('i');
    if (icon.className.includes('far')) {
        icon.className = 'fas fa-thumbs-down';
        button.classList.add('disliked');
        showToast('我们会改进的！', 'info');
    } else {
        icon.className = 'far fa-thumbs-down';
        button.classList.remove('disliked');
    }
}

function regenerateResponse(button) {
    // 找到上一条用户消息
    const aiMessage = button.closest('.message');
    const userMessage = aiMessage.previousElementSibling;
    
    if (userMessage && userMessage.classList.contains('user-message')) {
        const userText = userMessage.querySelector('.message-text').textContent;
        
        // 移除AI消息
        aiMessage.remove();
        
        // 重新发送
        showAIThinking();
        sendToAI(userText);
    } else {
        showToast('重新生成功能正在开发中...', 'info');
    }
}

function shareMessage(button) {
    const messageContent = button.closest('.message-content').querySelector('.ai-response');
    const text = messageContent.textContent;
    
    if (navigator.share) {
        navigator.share({
            title: '动漫推荐AI',
            text: text
        }).then(() => {
            showToast('分享成功', 'success');
        }).catch(() => {
            // 分享失败，回退到复制
            copyMessage(button);
            showToast('内容已复制，可手动分享', 'info');
        });
    } else {
        copyMessage(button);
        showToast('内容已复制，可手动分享', 'info');
    }
}

// Toast提示系统
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // 动画显示
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 显示成功消息
function showSuccessMessage(message) {
    showToast(message, 'success');
}

// 显示错误消息
function showErrorMessage(message) {
    showToast(message, 'error');
}

// 鼠标跟随效果
let mouseFollowerTimeout;
let lastMouseMove = 0;

function addMouseFollowEffect() {
    // 检查是否为移动设备
    if (window.innerWidth <= 768) return;
    
    document.addEventListener('mousemove', function(e) {
        const now = Date.now();
        
        // 限制创建频率，避免性能问题
        if (now - lastMouseMove < 50) return;
        lastMouseMove = now;
        
        createMouseFollower(e.clientX, e.clientY);
    });
}

function createMouseFollower(x, y) {
    // 清除之前的超时
    if (mouseFollowerTimeout) {
        clearTimeout(mouseFollowerTimeout);
    }
    
    const follower = document.createElement('div');
    follower.className = 'mouse-follower';
    follower.style.left = x + 'px';
    follower.style.top = y + 'px';
    
    document.body.appendChild(follower);
    
    // 添加随机颜色变化
    const colors = [
        'rgba(255, 105, 180, 0.6)',
        'rgba(138, 43, 226, 0.6)',
        'rgba(255, 20, 147, 0.6)',
        'rgba(199, 21, 133, 0.6)'
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    follower.style.background = `radial-gradient(circle, ${randomColor} 0%, ${randomColor.replace('0.6', '0.3')} 50%, transparent 70%)`;
    
    // 动画效果
    setTimeout(() => {
        follower.style.transform = 'translate(-50%, -50%) scale(0)';
        follower.style.opacity = '0';
    }, 100);
    
    // 清理DOM元素
    mouseFollowerTimeout = setTimeout(() => {
        if (document.body.contains(follower)) {
            document.body.removeChild(follower);
        }
    }, 600);
}

// 滚动到聊天区域
function scrollToChat() {
    const chatSection = document.getElementById('chat');
    if (chatSection) {
        chatSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
    
    setTimeout(() => {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.focus();
        }
    }, 800);
}

// 文生图功能
function handleText2Image() {
    // 创建一个模态框来输入图片描述
    const modal = document.createElement('div');
    modal.className = 'text2image-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeText2ImageModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>🎨 AI文生图</h3>
                <button class="modal-close" onclick="closeText2ImageModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="input-group">
                    <label for="imagePrompt">图片描述：</label>
                    <textarea 
                        id="imagePrompt" 
                        placeholder="请描述你想要生成的图片，例如：一个可爱的二次元女孩，粉色头发，大眼睛，微笑着..."
                        rows="4"
                    ></textarea>
                </div>
                <div class="modal-tips">
                    <p>💡 提示：描述越详细，生成的图片效果越好</p>
                    <p>🎯 建议包含：人物特征、服装、表情、背景、画风等</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="closeText2ImageModal()">取消</button>
                <button class="btn-generate" onclick="generateImage()">
                    <i class="fas fa-magic"></i>
                    生成图片
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 聚焦到输入框
    setTimeout(() => {
        const promptInput = document.getElementById('imagePrompt');
        if (promptInput) {
            promptInput.focus();
        }
    }, 100);
    
    // 添加键盘事件
    document.addEventListener('keydown', handleText2ImageKeydown);
}

function closeText2ImageModal() {
    const modal = document.querySelector('.text2image-modal');
    if (modal) {
        modal.remove();
    }
    document.removeEventListener('keydown', handleText2ImageKeydown);
}

function handleText2ImageKeydown(e) {
    if (e.key === 'Escape') {
        closeText2ImageModal();
    } else if (e.key === 'Enter' && e.ctrlKey) {
        generateImage();
    }
}

async function generateImage() {
    const promptInput = document.getElementById('imagePrompt');
    const prompt = promptInput.value.trim();
    
    if (!prompt) {
        showToast('请输入图片描述', 'warning');
        promptInput.focus();
        return;
    }
    
    // 关闭模态框
    closeText2ImageModal();
    
    // 添加用户消息到聊天界面
    addUserMessage(`🎨 生成图片：${prompt}`);
    
    // 显示生成中状态
    showImageGenerating();
    
    try {
        const response = await fetch('/api/text2image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                prompt: prompt
            })
        });
        
        const data = await response.json();
        
        // 移除生成中状态
        removeImageGenerating();
        
        if (data.status === 'success') {
            // 显示生成的图片
            addGeneratedImage(data.image_url, data.prompt);
            showToast('图片生成成功！', 'success');
        } else {
            addAIMessage(`抱歉，图片生成失败：${data.error}`, false);
            showToast('图片生成失败', 'error');
        }
    } catch (error) {
        console.error('Text2Image error:', error);
        removeImageGenerating();
        addAIMessage('抱歉，图片生成服务暂时不可用，请稍后再试~', false);
        showToast('网络错误，请稍后重试', 'error');
    }
}

function showImageGenerating() {
    const chatMessages = document.getElementById('chatMessages');
    
    const generatingElement = document.createElement('div');
    generatingElement.className = 'message ai-message generating-message';
    generatingElement.innerHTML = `
        <div class="message-avatar">
            <img src="生成二次元Logo头像.png" alt="AI" onerror="this.innerHTML='🤖'">
        </div>
        <div class="message-content">
            <div class="generating-container">
                <div class="generating-icon">
                    <i class="fas fa-magic fa-spin"></i>
                </div>
                <div class="generating-text">
                    <p>🎨 AI正在为你创作图片...</p>
                    <div class="generating-progress">
                        <div class="progress-bar"></div>
                    </div>
                    <p class="generating-tip">请稍等，通常需要10-30秒</p>
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(generatingElement);
    scrollToBottom();
}

function removeImageGenerating() {
    const generatingMessage = document.querySelector('.generating-message');
    if (generatingMessage) {
        generatingMessage.remove();
    }
}

function addGeneratedImage(imageUrl, prompt) {
    const chatMessages = document.getElementById('chatMessages');
    const messageElement = document.createElement('div');
    messageElement.className = 'message ai-message';
    messageElement.innerHTML = `
        <div class="message-avatar">
            <img src="生成二次元Logo头像.png" alt="AI" onerror="this.innerHTML='🤖'">
        </div>
        <div class="message-content">
            <div class="generated-image-container">
                <div class="image-header">
                    <h4>🎨 为你生成的图片</h4>
                    <p class="image-prompt">描述：${escapeHtml(prompt)}</p>
                </div>
                <div class="generated-image-wrapper">
                    <img src="${imageUrl}" alt="Generated Image" class="generated-image" 
                         onclick="openImagePreview('${imageUrl}')" 
                         
                </div>
            </div>
            <div class="message-time">${getCurrentTime()}</div>
            <div class="message-actions">
                <button class="action-btn" onclick="copyImageUrl('${imageUrl}')" title="复制图片链接">
                    <i class="fas fa-link"></i>
                </button>
                <button class="action-btn" onclick="regenerateImage('${prompt}')" title="重新生成">
                    <i class="fas fa-redo"></i>
                </button>
                <button class="action-btn" onclick="shareImage('${imageUrl}', '${prompt}')" title="分享">
                    <i class="fas fa-share"></i>
                </button>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageElement);
    scrollToBottom();
}

// 图片相关操作函数
function openImagePreview(imageUrl) {
    const preview = document.createElement('div');
    preview.className = 'image-preview-modal';
    preview.innerHTML = `
        <div class="preview-overlay" onclick="closeImagePreview()"></div>
        <div class="preview-content">
            <button class="preview-close" onclick="closeImagePreview()">
                <i class="fas fa-times"></i>
            </button>
            <img src="${imageUrl}" alt="Preview" class="preview-image">
        </div>
    `;
    
    document.body.appendChild(preview);
    
    // 添加键盘事件
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeImagePreview();
        }
    });
}

function closeImagePreview() {
    const preview = document.querySelector('.image-preview-modal');
    if (preview) {
        preview.remove();
    }
}

function downloadImage(imageUrl, prompt) {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `AI生成图片_${prompt.substring(0, 20)}_${new Date().getTime()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('图片下载已开始', 'success');
}

function copyImageUrl(imageUrl) {
    navigator.clipboard.writeText(imageUrl).then(() => {
        showToast('图片链接已复制到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function regenerateImage(prompt) {
    // 重新生成相同描述的图片
    addUserMessage(`🎨 重新生成图片：${prompt}`);
    showImageGenerating();
    
    fetch('/api/text2image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            prompt: prompt
        })
    })
    .then(response => response.json())
    .then(data => {
        removeImageGenerating();
        if (data.status === 'success') {
            addGeneratedImage(data.image_url, data.prompt);
            showToast('图片重新生成成功！', 'success');
        } else {
            addAIMessage(`抱歉，图片重新生成失败：${data.error}`, false);
            showToast('图片重新生成失败', 'error');
        }
    })
    .catch(error => {
        console.error('Regenerate image error:', error);
        removeImageGenerating();
        addAIMessage('抱歉，图片生成服务暂时不可用，请稍后再试~', false);
        showToast('网络错误，请稍后重试', 'error');
    });
}

function shareImage(imageUrl, prompt) {
    if (navigator.share) {
        navigator.share({
            title: 'AI生成的图片',
            text: `我用AI生成了一张图片：${prompt}`,
            url: imageUrl
        }).then(() => {
            showToast('分享成功', 'success');
        }).catch(() => {
            copyImageUrl(imageUrl);
            showToast('图片链接已复制，可手动分享', 'info');
        });
    } else {
        copyImageUrl(imageUrl);
        showToast('图片链接已复制，可手动分享', 'info');
    }
}

// 文生图模态框函数
function openText2ImageModal() {
    const modal = document.getElementById('text2imageModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // 聚焦到输入框
        setTimeout(() => {
            const promptInput = document.getElementById('imagePrompt');
            if (promptInput) {
                promptInput.focus();
            }
        }, 100);
        
        // 添加键盘事件
        document.addEventListener('keydown', handleText2ImageKeydown);
    }
}

function closeText2ImageModal() {
    const modal = document.getElementById('text2imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.removeEventListener('keydown', handleText2ImageKeydown);
}

function handleText2ImageKeydown(e) {
    if (e.key === 'Escape') {
        closeText2ImageModal();
    } else if (e.key === 'Enter' && e.ctrlKey) {
        generateImage();
    }
}

async function generateImage() {
    const promptInput = document.getElementById('imagePrompt');
    const prompt = promptInput.value.trim();
    
    if (!prompt) {
        showToast('请输入图片描述', 'warning');
        promptInput.focus();
        return;
    }
    
    // 关闭模态框
    closeText2ImageModal();
    
    // 清空输入框
    promptInput.value = '';
    
    // 添加用户消息到聊天界面
    addUserMessage(`🎨 生成图片：${prompt}`);
    
    // 显示生成中状态
    showImageGenerating();
    
    try {
        const response = await fetch('/api/text2image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                prompt: prompt,
                conversation_id: currentConversationId
            })
        });
        
        const data = await response.json();
        
        // 移除生成中状态
        removeImageGenerating();
        
        if (data.status === 'success') {
            // 显示生成的图片
            addGeneratedImage(data.image_url, data.prompt);
            showToast('图片生成成功！', 'success');
            
            // 更新对话ID
            if (data.conversation_id) {
                currentConversationId = data.conversation_id;
            }
            
            // 重新加载对话列表
            await loadConversations();
        } else {
            addAIMessage(`抱歉，图片生成失败：${data.error}`, false);
            showToast('图片生成失败', 'error');
        }
    } catch (error) {
        console.error('Text2Image error:', error);
        removeImageGenerating();
        addAIMessage('抱歉，图片生成服务暂时不可用，请稍后再试~', false);
        showToast('网络错误，请稍后重试', 'error');
    }
}

// 图片预览模态框函数
function openImagePreview(imageUrl) {
    const modal = document.getElementById('imagePreviewModal');
    const previewImage = document.getElementById('previewImage');
    
    if (modal && previewImage) {
        previewImage.src = imageUrl;
        modal.style.display = 'flex';
        
        // 添加键盘事件
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeImagePreview();
            }
        });
    }
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
