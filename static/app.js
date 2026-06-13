// 搜索引擎配置
const SEARCH_ENGINES = {
    baidu: {
        url: 'https://www.baidu.com/s?wd='
    },
    google: {
        url: 'https://www.google.com/search?q='
    },
    bing: {
        url: 'https://www.bing.com/search?q='
    }
};

// 保存搜索引擎选择
function saveSearchEngine(engine) {
    localStorage.setItem('preferred_search_engine', engine);
}

// 获取保存的搜索引擎 - 修复：默认改为 bing
function getSearchEngine() {
    return localStorage.getItem('preferred_search_engine') || 'bing';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 清理旧版本 HTML 残留的 mobileNavList 容器，防止出现裸文字
    const staleNavList = document.getElementById('mobileNavList');
    if (staleNavList) {
        const parent = staleNavList.closest('.mobile-nav');
        if (parent) parent.remove();
        else staleNavList.remove();
    }

    const searchEngine = document.getElementById('searchEngine');
    if (searchEngine) searchEngine.value = getSearchEngine();
    
    checkLoginStatus();
    initializePage();
});

// 检查登录状态
async function checkLoginStatus() {
    const token = getToken();
    if (token) {
        try {
            const response = await fetch(`${API_BASE_URL}/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                isAdmin = true;
                isEditMode = false;
                updateAdminButton();
            } else {
                setToken(null);
            }
        } catch (error) {
            console.error('验证token失败:', error);
            setToken(null);
        }
    }
}

async function initializePage() {
    await loadNavigation();
}

let isAdmin = false;
let isEditMode = false;

// 更新管理员按钮状态
function updateAdminButton() {
    const adminButton = document.getElementById('adminButton');
    if (isAdmin) {
        if (isEditMode) {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="exitEditMode()">
                    <i class="fas fa-times"></i> 退出编辑
                </button>
            `;
        } else {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="enterEditMode()">
                    <i class="fas fa-edit"></i> 编辑
                </button>
            `;
        }
    } else {
        adminButton.innerHTML = `
            <button class="admin-button" onclick="openAdminModal()">
                <i class="fas fa-user-lock"></i> 管理员登录
            </button>
        `;
    }
    // 同步手机端管理员按钮
    if (typeof syncMobileAdminButton === 'function') syncMobileAdminButton();

    // 快速添加按钮：登录后显示
    const quickAddBtn = document.getElementById('quickAddBtn');
    if (quickAddBtn) quickAddBtn.style.display = isAdmin ? 'flex' : 'none';
}

function enterEditMode() {
    isEditMode = true;
    updateAdminButton();
    loadNavigation().then(() => {
        // 进入编辑模式后自动检测链接失效
        setTimeout(runLinkHealthCheck, 1000);
    });
}

// 链接失效检测
async function runLinkHealthCheck() {
    try {
        const links = await fetchLinks();
        if (!links.length) return;
        const urlList = links.map(l => ({ id: l.id, url: l.url }));
        showToast(`正在检测 ${urlList.length} 个链接...`, 'loading');
        const results = await checkLinksHealth(urlList);
        const failedIds = new Set(results.filter(r => !r.ok).map(r => r.id));
        // 标记失效链接卡片
        document.querySelectorAll('.link-card').forEach(card => {
            const linkId = card.dataset.linkId;
            if (linkId && failedIds.has(parseInt(linkId))) {
                card.classList.add('link-dead');
            }
        });
        const failCount = failedIds.size;
        const toast = document.querySelector('.toast.loading');
        if (toast) toast.remove();
        if (failCount > 0) {
            showToast(`检测完成：${failCount} 个链接可能失效（红色标注）`, 'error');
        } else {
            showToast('检测完成：所有链接正常');
        }
    } catch (e) {
        const toast = document.querySelector('.toast.loading');
        if (toast) toast.remove();
        showToast('链接检测失败: ' + e.message, 'error');
    }
}

function exitEditMode() {
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

function handleLogout() {
    setToken(null);
    isAdmin = false;
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

function handleSearch(event) {
    event.preventDefault();
    const searchInput = document.getElementById('searchInput');
    const searchEngine = document.getElementById('searchEngine');
    const query = searchInput.value.trim();
    
    if (query) {
        const url = SEARCH_ENGINES[searchEngine.value].url + encodeURIComponent(query);
        window.open(url, '_blank');
    }

    saveSearchEngine(searchEngine.value);
}

function openAdminModal() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    
    try {
        await login(password);
        closeAdminModal();
        isAdmin = true;
        updateAdminButton();
        showToast('登录成功');
        await loadNavigation();
    } catch (error) {
        showToast('登录失败: ' + error.message, 'error');
    }
}

function openLinkModal(linkId = null) {
    if (!isEditMode) {
        showToast('请先进入编辑模式');
        return;
    }
    
    const modal = document.getElementById('linkModal');
    const form = document.getElementById('linkForm');
    form.reset();
    form.dataset.linkId = '';
    form.dataset.orderNum = '';
    
    updateGroupSelect();
    
    if (linkId) {
        loadLinkData(linkId);
    }
    
    const urlInput = document.getElementById('linkUrl');
    urlInput.removeEventListener('blur', autoFillLinkInfo);
    urlInput.addEventListener('blur', autoFillLinkInfo);
    
    modal.style.display = 'block';
}

function closeLinkModal() {
    document.getElementById('linkModal').style.display = 'none';
}

async function handleLinkSubmit(event) {
    event.preventDefault();
    const linkId = event.target.dataset.linkId;
    const groupId = parseInt(document.getElementById('linkGroup').value);

    if (!groupId) {
        showToast('请选择分组', 'error');
        return;
    }

    let orderNum;
    if (linkId) {
        const links = await fetchLinks();
        const currentLink = links.find(l => l.id === parseInt(linkId));
        
        if (currentLink && currentLink.group_id !== groupId) {
            try {
                const oldGroupLinks = links
                    .filter(l => l.group_id === currentLink.group_id)
                    .sort((a, b) => a.order_num - b.order_num);
                
                for (let i = 0; i < oldGroupLinks.length; i++) {
                    const link = oldGroupLinks[i];
                    if (link.order_num > currentLink.order_num) {
                        await updateLink(link.id, { ...link, order_num: link.order_num - 1 });
                    }
                }
                
                const groupLinks = links.filter(l => l.group_id === groupId);
                orderNum = groupLinks.length + 1;
            } catch (error) {
                showToast('更新序号失败: ' + error.message, 'error');
                return;
            }
        } else {
            orderNum = parseInt(event.target.dataset.orderNum) || 0;
        }
    } else {
        // 修复：新增链接时获取当前分组最大序号
        try {
            const links = await fetchLinks();
            const groupLinks = links.filter(l => l.group_id === groupId);
            const maxOrderNum = groupLinks.reduce((max, link) => Math.max(max, link.order_num || 0), 0);
            orderNum = maxOrderNum + 1;
        } catch (error) {
            console.error('获取链接序号失败:', error);
            orderNum = 1;
        }
    }
    
    // 修复：使用 linkUrlValue 避免与全局变量冲突
    const linkUrlValue = document.getElementById('linkUrl').value;

    const formData = {
        name: document.getElementById('linkName').value,
        url: linkUrlValue,
        logo: document.getElementById('linkLogo').value,
        description: document.getElementById('linkDescription').value,
        group_id: groupId,
        order_num: orderNum
    };
    
    try {
        if (linkId) {
            await updateLink(parseInt(linkId), formData);
        } else {
            await createLink(formData);
        }
        
        closeLinkModal();
        showToast('保存成功');
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

function openGroupModal(groupId = null) {
    if (!isEditMode) {
        showToast('请先进入编辑模式');
        return;
    }
    
    const modal = document.getElementById('groupModal');
    const form = document.getElementById('groupForm');
    form.reset();
    form.dataset.groupId = groupId || '';
    
    if (groupId) {
        loadGroupData(groupId);
    }
    
    modal.style.display = 'block';
}

function closeGroupModal() {
    document.getElementById('groupModal').style.display = 'none';
}

async function handleGroupSubmit(event) {
    event.preventDefault();
    const groupId = event.target.dataset.groupId;
    
    const groups = await fetchGroups();
    const maxOrderNum = Math.max(0, ...groups.map(g => g.order_num || 0));
    
    const formData = {
        name: document.getElementById('groupName').value,
        is_private: document.getElementById('groupPrivate').checked,
        order_num: groupId ? parseInt(event.target.dataset.orderNum) || 0 : maxOrderNum + 1,
        color: document.getElementById('groupColor').value || null,
        icon: document.getElementById('groupIcon').value || null
    };
    
    try {
        if (groupId) {
            await updateGroup(groupId, formData);
        } else {
            await createGroup(formData);
        }
        closeGroupModal();
        showToast('分组保存成功');
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

const iconCache = new Map();

async function getIconUrl({ url }) {
    try {
        const domain = new URL(url).hostname;
        // 1. 先查 localStorage 缓存
        const localKey = `icon_cache_${domain}`;
        const localCached = localStorage.getItem(localKey);
        if (localCached) return localCached;

        // 2. 查 R2 缓存（Worker 端已抓取存储）
        const r2Url = await getIconFromCache(domain);
        if (r2Url) {
            localStorage.setItem(localKey, r2Url);
            return r2Url;
        }

        // 3. 让 Worker 抓取并存入 R2
        const saved = await saveIconToCache(domain);
        if (saved) {
            localStorage.setItem(localKey, saved);
            return saved;
        }

        // 4. 降级：用 Google favicon 服务，覆盖面最广且支持跨域
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch (error) {
        return null;
    }
}

async function loadNavigation() {
    const navigationElement = document.getElementById('navigation');
    const groupNavElement = document.getElementById('groupNav');
    
    const loadingHtml = `
        <div class="nav-loading">
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
        </div>
    `;
    
    navigationElement.innerHTML = `
        <div class="loading">
            <div class="loading-wave"><div></div><div></div></div>
            <div>加载中...</div>
        </div>
    `;
    groupNavElement.innerHTML = loadingHtml;
    
    try {
        const groups = await fetchGroups();
        const links = await fetchLinks();
        
        let html = '';
        let navHtml = '';
        
        // 编辑模式操作栏渲染到 page-header 固定区域
        const adminControlsEl = document.getElementById('adminControlsBar');
        if (adminControlsEl) {
            if (isEditMode) {
                adminControlsEl.innerHTML = `
                    <div class="admin-controls">
                        <button onclick="openGroupModal()">
                            <i class="fas fa-folder-plus"></i> 添加分组
                        </button>
                        <button onclick="openLinkModal()">
                            <i class="fas fa-link"></i> 添加链接
                        </button>
                        <button onclick="openBatchAdd()">
                            <i class="fas fa-layer-group"></i> 批量添加
                        </button>
                        <button onclick="openCheckLinks()">
                            <i class="fas fa-heartbeat"></i> 检测失效
                        </button>
                    <button onclick="refreshAllIcons()">
                            <i class="fas fa-images"></i> 刷新图标
                        </button>
                    </div>
                `;
            } else {
                adminControlsEl.innerHTML = '';
            }
        }
        
        if (groups.length === 0) {
            navigationElement.innerHTML = html + '<div style="padding:40px;color:#888;text-align:center;">暂无内容，请登录后添加分组和链接</div>';
            groupNavElement.innerHTML = '暂无分组';
            return;
        }
        
        for (const group of groups) {
            if (!group.is_private || isAdmin) {
                // 修复：不限制链接数量，获取所有该分组链接
                const groupLinks = links.filter(link => link.group_id === group.id);
                const groupId = `group-${group.id}`;
                
                const groupColor = group.color || '#4299e1';
                html += `
                    <div id="${groupId}" class="group" style="--group-color:${groupColor};">
                        <div class="group-title">
                            ${getGroupTitle(group)}
                            ${getGroupActions(group.id)}
                        </div>
                        <div class="links">
                            ${groupLinks.length > 0 
                                ? groupLinks.map(link => getLinkCard(link)).join('')
                                : '<div style="color:#aaa;font-size:13px;padding:10px 0;">暂无链接</div>'
                            }
                        </div>
                    </div>
                `;
                
                navHtml += `
                    <a href="#${groupId}" 
                       class="nav-item" 
                       onclick="highlightNavItem(this)"
                       data-group-id="${groupId}">
                        ${group.name}
                        ${group.is_private ? 
                            `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : ''
                        }
                    </a>
                `;
            }
        }
        
        navigationElement.innerHTML = html;
        groupNavElement.innerHTML = navHtml;

        // 应用分组自定义颜色到下划线
        groups.forEach(group => {
            const color = group.color || '#4299e1';
            const el = document.getElementById(`group-${group.id}`);
            if (el) {
                const after = el.querySelector('.group-title');
                if (after) after.style.setProperty('--group-color', color);
            }
        });

        // 同步手机端下拉目录
        const mobileNavDropdown = document.getElementById('mobileNavDropdown');
        if (mobileNavDropdown) mobileNavDropdown.innerHTML = navHtml;
        // 同步手机端管理员按钮
        if (typeof syncMobileAdminButton === 'function') syncMobileAdminButton();
        
        await loadIcons();
        
        window.addEventListener('scroll', updateActiveNavItem);
    } catch (error) {
        navigationElement.innerHTML = `<div class="error" style="padding:40px;color:#e53e3e;text-align:center;">加载失败: ${error.message}</div>`;
        groupNavElement.innerHTML = `<div style="color:#e53e3e;font-size:13px;">加载失败</div>`;
    }
}

function highlightNavItem(element) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
}

function updateActiveNavItem() {
    const groups = document.querySelectorAll('.group');
    const navItems = document.querySelectorAll('.nav-item');
    
    groups.forEach((group, index) => {
        const rect = group.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom >= 100) {
            if (navItems[index]) highlightNavItem(navItems[index]);
        }
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'error':   icon = '<i class="fas fa-times-circle"></i>'; break;
        case 'loading': icon = '<i class="fas fa-spinner fa-spin"></i>'; break;
    }
    
    toast.innerHTML = `${icon}${message}`;
    container.appendChild(toast);
    
    if (type !== 'loading') {
        setTimeout(() => { toast.remove(); }, 3000);
    }
    
    return toast;
}

function showConfirm(title, message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirmDialog');
        dialog.querySelector('.confirm-title').textContent = title;
        dialog.querySelector('.confirm-message').textContent = message;
        dialog.style.display = 'block';
        
        const handleClick = (result) => {
            dialog.style.display = 'none';
            resolve(result);
        };
        
        dialog.querySelector('.confirm-ok').onclick = () => handleClick(true);
        dialog.querySelector('.confirm-cancel').onclick = () => handleClick(false);
    });
}

window.onclick = function(event) {
    const modal = document.getElementById('adminModal');
    if (event.target === modal) closeAdminModal();
}

async function deleteGroupConfirm(groupId) {
    const confirmed = await showConfirm('删除分组', '确定要删除这个分组吗？这将同时删除组内的所有链接！');
    if (confirmed) {
        const toast = showToast('正在删除分组...', 'loading');
        try {
            await deleteGroup(groupId);
            toast.remove();
            showToast('分组删除成功');
            await loadNavigation();
        } catch (error) {
            toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

async function loadGroupData(groupId) {
    try {
        const groups = await fetchGroups();
        const group = groups.find(g => g.id === parseInt(groupId));
        if (group) {
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupPrivate').checked = group.is_private;
            document.getElementById('groupColor').value = group.color || '#4299e1';
            document.getElementById('groupIcon').value = group.icon || '';
            const form = document.getElementById('groupForm');
            form.dataset.groupId = groupId;
            form.dataset.orderNum = group.order_num;
        }
    } catch (error) {
        showToast('加载分组数据失败: ' + error.message, 'error');
    }
}

async function loadLinkData(linkId) {
    try {
        const links = await fetchLinks();
        const link = links.find(l => l.id === linkId);
        if (link) {
            document.getElementById('linkName').value = link.name;
            document.getElementById('linkUrl').value = link.url;
            document.getElementById('linkLogo').value = link.logo || '';
            document.getElementById('linkDescription').value = link.description || '';
            document.getElementById('linkGroup').value = link.group_id;
            document.getElementById('linkForm').dataset.linkId = linkId;
            document.getElementById('linkForm').dataset.orderNum = link.order_num;
        }
    } catch (error) {
        showToast('加载链接数据失败: ' + error.message, 'error');
    }
}

async function updateGroupSelect() {
    const select = document.getElementById('linkGroup');
    try {
        const groups = await fetchGroups();
        select.innerHTML = '<option value="">选择分组...</option>' +
            groups.map(group => `<option value="${group.id}">${group.name}</option>`).join('');
    } catch (error) {
        console.error('加载分组列表失败:', error);
    }
}

async function deleteLinkConfirm(linkId) {
    const confirmed = await showConfirm('删除链接', '确定要删除这个链接吗？');
    if (confirmed) {
        const toast = showToast('正在删除链接...', 'loading');
        try {
            await deleteLink(linkId);
            toast.remove();
            showToast('链接删除成功');
            await loadNavigation();
        } catch (error) {
            toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

async function moveLinkUp(linkId, groupId) {
    const links = (await fetchLinks()).filter(l => l.group_id === groupId).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === 0) { showToast('已经是第一个链接了', 'error'); return; }
    
    const toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const prevLink = links[currentIndex - 1];
    try {
        await updateLink(currentLink.id, { ...currentLink, order_num: prevLink.order_num });
        await updateLink(prevLink.id, { ...prevLink, order_num: currentLink.order_num });
        toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

async function moveLinkDown(linkId, groupId) {
    const links = (await fetchLinks()).filter(l => l.group_id === groupId).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === links.length - 1) { showToast('已经是最后一个链接了', 'error'); return; }
    
    const toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const nextLink = links[currentIndex + 1];
    try {
        await updateLink(currentLink.id, { ...currentLink, order_num: nextLink.order_num });
        await updateLink(nextLink.id, { ...nextLink, order_num: currentLink.order_num });
        toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

async function autoFillLinkInfo() {
    const urlInput = document.getElementById('linkUrl');
    const nameInput = document.getElementById('linkName');
    const logoInput = document.getElementById('linkLogo');
    const descriptionInput = document.getElementById('linkDescription');
    const urlValue = urlInput.value.trim();

    if (!urlValue) return;

    const toast = showToast('正在获取网页信息...', 'loading');
    try {
        const iconUrl = await getIconUrl({ url: urlValue });
        const info = await fetchWebInfo(urlValue);
        
        if (!nameInput.value) nameInput.value = info.title || '';
        if (!logoInput.value) logoInput.value = iconUrl || '';
        if (!descriptionInput.value) descriptionInput.value = info.description || '';
        
        toast.remove();
        showToast('获取网页信息成功');
    } catch (error) {
        toast.remove();
        showToast('获取网页信息失败: ' + error.message, 'error');
    }
}

async function moveGroupUp(groupId) {
    const groups = await fetchGroups();
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === 0) { showToast('已经是第一个分组了', 'error'); return; }
    
    const toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const prevGroup = groups[currentIndex - 1];
    try {
        await updateGroup(currentGroup.id, { ...currentGroup, order_num: prevGroup.order_num });
        await updateGroup(prevGroup.id, { ...prevGroup, order_num: currentGroup.order_num });
        toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

async function moveGroupDown(groupId) {
    const groups = await fetchGroups();
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === groups.length - 1) { showToast('已经是最后一个分组了', 'error'); return; }
    
    const toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const nextGroup = groups[currentIndex + 1];
    try {
        await updateGroup(currentGroup.id, { ...currentGroup, order_num: nextGroup.order_num });
        await updateGroup(nextGroup.id, { ...nextGroup, order_num: currentGroup.order_num });
        toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

function getGroupActions(groupId) {
    if (!isEditMode) return '';
    return `
        <div class="group-actions">
            <div class="order-actions">
                <button onclick="moveGroupUp(${groupId})" title="上移"><i class="fas fa-arrow-up"></i></button>
                <button onclick="moveGroupDown(${groupId})" title="下移"><i class="fas fa-arrow-down"></i></button>
            </div>
            <button onclick="openGroupModal(${groupId})" title="编辑"><i class="fas fa-edit"></i></button>
            <button onclick="deleteGroupConfirm(${groupId})" title="删除"><i class="fas fa-trash"></i></button>
        </div>
    `;
}

function getGroupTitle(group) {
    const color = group.color || '#4299e1';
    const iconHtml = group.icon
        ? `<span class="group-custom-icon" style="color:${color}">${group.icon}</span>`
        : `<span class="group-color-dot" style="background:${color}"></span>`;
    return `
        <div class="group-title-left">
            ${iconHtml}
            <span style="border-bottom: 2px solid ${color}; padding-bottom:1px;">${group.name}</span>
            ${group.is_private ? 
                `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : 
                (isEditMode ? `<i class="fas fa-lock-open group-privacy-icon" title="公开分组"></i>` : '')
            }
        </div>
    `;
}

function getLinkCard(link) {
    const defaultIcon = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="12" fill="#4299e1" opacity="0.1"/>
            <path fill="#4299e1" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
    `.trim());

    const domain = (() => { try { return new URL(link.url).hostname; } catch(e) { return ''; } })();
    const iconSrc = link.logo || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '#');

    return `
        <a href="${link.url}" target="_blank" class="link-card" data-link-id="${link.id}">
            <div class="link-info">
                <div class="link-icon">
                    <img src="${iconSrc}" 
                        data-url="${link.url}"
                        alt="${link.name}" 
                        ${!link.logo ? 'data-auto-icon="true"' : ''}
                        onerror="this.onerror=null; this.src='data:image/svg+xml,${defaultIcon}';">
                </div>
                <div class="link-text">
                    <span class="link-title">${link.name}</span>
                    <div class="link-description">${link.description || ''}</div>
                </div>
            </div>
            ${isEditMode ? `
                <div class="link-actions" onclick="event.preventDefault();">
                    <div class="order-actions">
                        <button onclick="moveLinkUp(${link.id}, ${link.group_id})" title="上移"><i class="fas fa-arrow-up"></i></button>
                        <button onclick="moveLinkDown(${link.id}, ${link.group_id})" title="下移"><i class="fas fa-arrow-down"></i></button>
                    </div>
                    <button onclick="openLinkModal(${link.id})" title="编辑"><i class="fas fa-edit"></i></button>
                    <button onclick="refreshLinkIcon(event, ${link.id}, encodeURIComponent('${link.url}'))" title="刷新图标"><i class="fas fa-sync-alt"></i></button>
                    <button onclick="deleteLinkConfirm(${link.id})" title="删除"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        </a>
    `;
}


// ========== 快速添加书签 ==========
function openQuickAdd() {
    if (!isAdmin) { showToast('请先登录管理员账号', 'error'); return; }
    document.getElementById('quickAddUrl').value = '';
    document.getElementById('quickAddName').value = '';
    document.getElementById('quickAddLogo').value = '';
    document.getElementById('quickAddDesc').value = '';
    document.getElementById('quickAddInfo').style.display = 'none';
    updateQuickAddGroupSelect();
    document.getElementById('quickAddModal').style.display = 'block';
    setTimeout(() => document.getElementById('quickAddUrl').focus(), 100);
}

function closeQuickAdd() {
    document.getElementById('quickAddModal').style.display = 'none';
}

async function updateQuickAddGroupSelect() {
    const select = document.getElementById('quickAddGroup');
    const groups = await fetchGroups();
    select.innerHTML = '<option value="">选择分组...</option>' +
        groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
}

async function quickAddFetchInfo() {
    const url = document.getElementById('quickAddUrl').value.trim();
    if (!url || !url.startsWith('http')) return;
    const infoEl = document.getElementById('quickAddInfo');
    infoEl.style.display = 'block';
    infoEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在获取网页信息...';
    try {
        const [info, iconUrl] = await Promise.allSettled([
            fetchWebInfo(url),
            getIconUrl({ url })
        ]);
        if (info.status === 'fulfilled' && info.value.title) {
            if (!document.getElementById('quickAddName').value)
                document.getElementById('quickAddName').value = info.value.title;
            if (!document.getElementById('quickAddDesc').value)
                document.getElementById('quickAddDesc').value = info.value.description || '';
        }
        if (iconUrl.status === 'fulfilled' && iconUrl.value) {
            document.getElementById('quickAddLogo').value = iconUrl.value;
        }
        infoEl.innerHTML = '<i class="fas fa-check-circle" style="color:#48bb78;"></i> 信息获取成功';
        setTimeout(() => { infoEl.style.display = 'none'; }, 2000);
    } catch(e) {
        infoEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#e53e3e;"></i> 获取失败，请手动填写';
    }
}

async function handleQuickAdd() {
    const url = document.getElementById('quickAddUrl').value.trim();
    const name = document.getElementById('quickAddName').value.trim();
    const groupId = parseInt(document.getElementById('quickAddGroup').value);

    if (!url) { showToast('请输入网址', 'error'); return; }
    if (!name) { showToast('请输入名称', 'error'); return; }
    if (!groupId) { showToast('请选择分组', 'error'); return; }

    const btn = document.getElementById('quickAddSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';

    try {
        const links = await fetchLinks();
        const groupLinks = links.filter(l => l.group_id === groupId);
        const maxOrder = groupLinks.reduce((m, l) => Math.max(m, l.order_num || 0), 0);

        await createLink({
            name,
            url,
            logo: document.getElementById('quickAddLogo').value || '',
            description: document.getElementById('quickAddDesc').value || '',
            group_id: groupId,
            order_num: maxOrder + 10
        });

        closeQuickAdd();
        showToast('书签添加成功');
        await loadNavigation();
    } catch(e) {
        showToast('添加失败: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> 添加书签';
    }
}

// ========== 图标加载 ==========
async function loadIcons() {
    const icons = document.querySelectorAll('.link-icon img');
    for (const img of icons) {
        if (img.dataset.autoIcon === 'true') {
            const url = img.dataset.url;
            if (url) {
                try {
                    const domain = new URL(url).hostname;
                    img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    getIconUrl({ url }).then(iconUrl => {
                        if (iconUrl && img.isConnected) img.src = iconUrl;
                    }).catch(() => {});
                } catch (error) {}
            }
        }
    }
}

// ========== 单个图标刷新 ==========
async function refreshLinkIcon(event, linkId, encodedUrl) {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    const card = btn.closest('.link-card');
    const img = card ? card.querySelector('.link-icon img') : null;

    let domain;
    try { domain = new URL(decodeURIComponent(encodedUrl)).hostname; } catch(e) { return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        localStorage.removeItem(`icon_cache_${domain}`);
        const saved = await saveIconToCache(domain, true);
        const newUrl = saved || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        if (img) img.src = newUrl;
        localStorage.setItem(`icon_cache_${domain}`, newUrl);
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; btn.disabled = false; }, 1500);
        showToast('图标已更新');
    } catch (e) {
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        btn.disabled = false;
        showToast('刷新失败: ' + e.message, 'error');
    }
}

// ========== 批量刷新所有图标 ==========
async function refreshAllIcons() {
    const links = await fetchLinks();
    if (!links.length) { showToast('暂无链接', 'error'); return; }

    const domains = [...new Set(links.map(l => {
        try { return new URL(l.url).hostname; } catch(e) { return null; }
    }).filter(Boolean))];

    const toast = showToast(`正在刷新 ${domains.length} 个域名的图标...`, 'loading');
    let done = 0;
    for (const domain of domains) {
        try {
            localStorage.removeItem(`icon_cache_${domain}`);
            await saveIconToCache(domain, true);
            done++;
        } catch(e) { done++; }
    }
    toast.remove();
    showToast(`图标刷新完成，共处理 ${done} 个域名`);
    await loadIcons();
}
