// 从全局变量中获取 API 地址，并添加 /api 路径
const API_BASE_URL = 'https://dhhouduan.128668.xyz/api';
let token = null;

function getToken() {
    return localStorage.getItem('admin_token');
}

function setToken(newToken) {
    token = newToken;
    if (newToken) {
        localStorage.setItem('admin_token', newToken);
    } else {
        localStorage.removeItem('admin_token');
    }
}

async function login(password) {
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    if (!response.ok) throw new Error('登录失败');
    const data = await response.json();
    setToken(data.token);
    return data;
}

function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ===== 分组 =====
async function fetchGroups() {
    const response = await fetch(`${API_BASE_URL}/groups`, { headers: authHeaders() });
    if (!response.ok) throw new Error('获取分组失败');
    return response.json();
}

async function createGroup(data) {
    const response = await fetch(`${API_BASE_URL}/groups`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('创建分组失败');
    return response.json();
}

async function updateGroup(id, data) {
    const response = await fetch(`${API_BASE_URL}/groups/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('更新分组失败');
    return response.json();
}

async function deleteGroup(id) {
    const response = await fetch(`${API_BASE_URL}/groups/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('删除分组失败');
    return response.json();
}

// ===== 链接 =====
async function fetchLinks() {
    const response = await fetch(`${API_BASE_URL}/links`, { headers: authHeaders() });
    if (!response.ok) throw new Error('获取链接失败');
    return response.json();
}

async function createLink(data) {
    const response = await fetch(`${API_BASE_URL}/links`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('创建链接失败');
    return response.json();
}

async function updateLink(id, data) {
    const response = await fetch(`${API_BASE_URL}/links/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('更新链接失败');
    return response.json();
}

async function deleteLink(id) {
    const response = await fetch(`${API_BASE_URL}/links/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!response.ok) throw new Error('删除链接失败');
    return response.json();
}

// ===== 网页信息抓取 =====
async function fetchWebInfo(url) {
    const response = await fetch(`${API_BASE_URL}/fetch-info`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ url })
    });
    if (!response.ok) throw new Error('获取网页信息失败');
    return response.json();
}

// ===== 图标 R2 缓存 =====
async function getIconFromCache(domain) {
    try {
        const response = await fetch(`${API_BASE_URL}/icon-cache?domain=${encodeURIComponent(domain)}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.url || null;
    } catch (e) {
        return null;
    }
}

async function saveIconToCache(domain) {
    try {
        const response = await fetch(`${API_BASE_URL}/icon-cache?domain=${encodeURIComponent(domain)}`, {
            method: 'POST',
            headers: authHeaders()
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.url || null;
    } catch (e) {
        return null;
    }
}

// ===== 链接失效检测 =====
async function checkLinksHealth(urls) {
    const response = await fetch(`${API_BASE_URL}/check-links`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ urls })
    });
    if (!response.ok) throw new Error('检测失败');
    return response.json();
}

// ===== 批量添加链接 =====
async function batchCreateLinks(links) {
    const response = await fetch(`${API_BASE_URL}/links/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ links })
    });
    if (!response.ok) throw new Error('批量添加失败');
    return response.json();
}
