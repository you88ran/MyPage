function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Base64 编码
function base64Encode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Base64 解码
function base64Decode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

// 生成 JWT token
async function generateToken(env) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    iat: Math.floor(Date.now() / 1000),
    admin: true
  };

  const encodedPayload = base64Encode(JSON.stringify(payload));
  const signature = base64Encode(env.JWT_SECRET + encodedPayload);
  return `${encodedPayload}.${signature}`;
}

// 验证 JWT token
async function verifyToken(token, env) {
  try {
    const [encodedPayload, signature] = token.split('.');
    const expectedSignature = base64Encode(env.JWT_SECRET + encodedPayload);
    if (signature !== expectedSignature) {
      return false;
    }
    const payload = JSON.parse(base64Decode(encodedPayload));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    return payload.admin === true;
  } catch (error) {
    return false;
  }
}

// 验证管理员权限
async function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.split(' ')[1];
  return await verifyToken(token, env);
}

// 处理登录请求
async function handleLogin(request, env) {
  if (request.method !== 'POST') {
    return new Response('方法不允许', { status: 405 });
  }

  const { password } = await request.json();
  if (password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }

  const token = await generateToken(env);
  return new Response(JSON.stringify({ token }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

// 处理 token 验证请求
async function handleVerify(request, env) {
  const isAdmin = await verifyAdmin(request, env);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'token无效' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
  return new Response(JSON.stringify({ valid: true }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

async function handleGroups(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const id = path.match(/\/api\/groups\/(\d+)/)?.[1];
  const isAdmin = await verifyAdmin(request, env);

  const headers = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/groups - 获取所有分组
    if (request.method === 'GET' && path === '/api/groups') {
      let query = 'SELECT * FROM Groups';
      if (!isAdmin) {
        query += ' WHERE is_private = FALSE';
      }
      query += ' ORDER BY order_num ASC';

      const groups = await env.DB.prepare(query).all();
      return new Response(JSON.stringify(groups.results), { headers });
    }

    // 以下操作需要管理员权限
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), {
        status: 401,
        headers
      });
    }

    // POST /api/groups - 创建新分组
    if (request.method === 'POST' && path === '/api/groups') {
      const { name, order_num, is_private } = await request.json();
      
      const result = await env.DB.prepare(
        'INSERT INTO Groups (name, order_num, is_private) VALUES (?, ?, ?)'
      ).bind(name, order_num || 0, is_private || false)
        .run();

      return new Response(JSON.stringify({
        id: result.lastRowId,
        name,
        order_num,
        is_private
      }), { headers });
    }

    // 需要ID的操作
    if (!id) {
      return new Response('缺少ID参数', { status: 400, headers });
    }

    // PUT /api/groups/:id - 更新分组
    if (request.method === 'PUT') {
      const { name, order_num, is_private } = await request.json();
      
      await env.DB.prepare(
        'UPDATE Groups SET name = ?, order_num = ?, is_private = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(name, order_num || 0, is_private || false, id)
        .run();

      return new Response(JSON.stringify({
        id: parseInt(id),
        name,
        order_num: order_num || 0,
        is_private
      }), { headers });
    }

    // DELETE /api/groups/:id - 删除分组
    if (request.method === 'DELETE') {
      await env.DB.prepare('BEGIN').run();
      
      try {
        const group = await env.DB.prepare('SELECT order_num FROM Groups WHERE id = ?')
          .bind(id)
          .first();
        
        if (!group) {
          throw new Error('分组不存在');
        }

        await env.DB.prepare('DELETE FROM Links WHERE group_id = ?')
          .bind(id)
          .run();

        await env.DB.prepare('DELETE FROM Groups WHERE id = ?')
          .bind(id)
          .run();

        await env.DB.prepare(`
          UPDATE Groups 
          SET order_num = order_num - 1 
          WHERE order_num > ?
        `).bind(group.order_num)
          .run();

        await env.DB.prepare('COMMIT').run();

        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (error) {
        await env.DB.prepare('ROLLBACK').run();
        throw error;
      }
    }

    return new Response('方法不允许', { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers 
    });
  }
}

async function handleLinks(request, env) {
  const reqUrl = new URL(request.url);  // 修复：重命名为 reqUrl 避免与链接 url 字段冲突
  const path = reqUrl.pathname;
  const id = path.match(/\/api\/links\/(\d+)/)?.[1];
  const groupId = reqUrl.searchParams.get('group_id');
  const isAdmin = await verifyAdmin(request, env);

  const headers = {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  };

  try {
    // GET /api/links - 获取所有链接
    if (request.method === 'GET' && path === '/api/links') {
      let query = `
        SELECT Links.*, Groups.name as group_name 
        FROM Links 
        LEFT JOIN Groups ON Links.group_id = Groups.id
      `;
      
      const params = [];
      const conditions = [];

      if (!isAdmin) {
        conditions.push('Groups.is_private = FALSE');
      }
      
      if (groupId) {
        conditions.push('Links.group_id = ?');
        params.push(groupId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY Links.order_num ASC';

      const links = await env.DB.prepare(query)
        .bind(...params)
        .all();

      return new Response(JSON.stringify(links.results), { headers });
    }

    // 以下操作需要管理员权限
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), {
        status: 401,
        headers
      });
    }

    // POST /api/links - 创建新链接
    if (request.method === 'POST' && path === '/api/links') {
      // 修复：解构时将 url 重命名为 linkUrl，避免与 reqUrl 变量名语义混淆
      const { name, url: linkUrl, logo, description, group_id, order_num } = await request.json();
      
      let currentMaxOrder = 0;
      if (group_id) {
        const result = await env.DB.prepare(`
          SELECT MAX(order_num) as max_order 
          FROM Links 
          WHERE group_id = ?
        `).bind(group_id).all();
        currentMaxOrder = result.results[0].max_order || 0;
      }
      
      const result = await env.DB.prepare(`
        INSERT INTO Links (name, url, logo, description, group_id, order_num) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        name,
        linkUrl,          // 修复：使用 linkUrl
        logo || null,
        description || null,
        group_id || null,
        order_num !== undefined ? order_num : (currentMaxOrder + 10)
      ).run();

      return new Response(JSON.stringify({
        id: result.lastRowId,
        name,
        url: linkUrl,     // 修复：使用 linkUrl
        logo,
        description,
        group_id,
        order_num
      }), { headers });
    }

    // 需要ID的操作
    if (!id) {
      return new Response('缺少ID参数', { status: 400, headers });
    }

    // PUT /api/links/:id - 更新链接
    if (request.method === 'PUT') {
      // 修复：解构时将 url 重命名为 linkUrl
      const { name, url: linkUrl, logo, description, group_id, order_num } = await request.json();
      
      await env.DB.prepare(`
        UPDATE Links 
        SET name = ?, url = ?, logo = ?, description = ?, 
            group_id = ?, order_num = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        name,
        linkUrl,          // 修复：使用 linkUrl
        logo || null,
        description || null,
        group_id || null,
        order_num || 0,
        id
      ).run();

      return new Response(JSON.stringify({
        id: parseInt(id),
        name,
        url: linkUrl,     // 修复：使用 linkUrl
        logo,
        description,
        group_id,
        order_num
      }), { headers });
    }

    // DELETE /api/links/:id - 删除链接
    if (request.method === 'DELETE') {
      await env.DB.prepare(
        'DELETE FROM Links WHERE id = ?'
      ).bind(id)
        .run();

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response('方法不允许', { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers 
    });
  }
}

// 抓取网页信息
async function fetchWebsiteInfo(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descriptionMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) 
      || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
    
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      description: descriptionMatch ? descriptionMatch[1].trim() : ''
    };
  } catch (error) {
    throw new Error('无法获取网页信息');
  }
}

// 处理网页信息获取请求
async function handleFetchInfo(request) {
  if (request.method !== 'POST') {
    return new Response('方法不允许', { status: 405 });
  }

  try {
    const { url } = await request.json();
    const info = await fetchWebsiteInfo(url);
    
    return new Response(JSON.stringify(info), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/login') {
        return await handleLogin(request, env);
      } else if (path === '/api/fetch-info') {
        return await handleFetchInfo(request);
      } else if (path === '/api/verify') {
        return await handleVerify(request, env);
      } else if (path.startsWith('/api/groups')) {
        return await handleGroups(request, env);
      } else if (path.startsWith('/api/links')) {
        return await handleLinks(request, env);
      }

      return new Response('无效的请求路径', { 
        status: 404,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: err.message,
        stack: err.stack
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  },
};
