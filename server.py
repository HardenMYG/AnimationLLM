from flask import Flask, request, jsonify, send_from_directory, render_template_string, session, redirect, url_for
from flask_cors import CORS
import sys
import os
import hashlib
import json
from datetime import datetime
import base64
import tempfile
from werkzeug.utils import secure_filename
import requests
import subprocess
import threading
import time

# 添加当前目录到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 导入你的动漫推荐模块
from Animationllm import get_anime_recommendation, text2image_ark, ArkText2ImageRequest

app = Flask(__name__)
app.secret_key = 'your-secret-key-for-anime-ai-2024'  # 用于session加密
CORS(app, supports_credentials=True)

@app.route('/api/ai/proxy', methods=['POST'])
def ai_proxy():
    """代理AI API请求"""
    if 'user_id' not in session:
        return jsonify({'error': '请先登录'}), 401

    try:
        # 获取原始请求数据
        data = request.get_json()
        headers = {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('Authorization')
        }

        # 转发请求到DeepSeek API
        response = requests.post(
            'https://api.deepseek.com/v1/chat/completions',
            json=data,
            headers=headers
        )

        # 返回API响应
        return response.json(), response.status_code

    except Exception as e:
        return jsonify({
            'error': f'API代理请求失败: {str(e)}',
            'status': 'error'
        }), 500


@app.route('/api/userinfo', methods=['GET', 'POST'])
def get_userinfo():
    """获取当前用户详细信息（邮箱和喜欢的作品）"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    users = load_users()
    user_id = session['user_id']
    user_data = users.get(user_id, {})
    email = user_data.get('email', '')
    favorites = user_data.get('favorites', [])
    # 自动补充 favorites 字段
    if not isinstance(user_data, dict):
        user_data = {}
    if request.method == 'POST':
        data = request.get_json()
        favorites = data.get('favorites', [])
        user_data['favorites'] = favorites
        users[user_id] = user_data
        save_users(users)
        return jsonify({'status': 'success'})
    user_data['favorites'] = favorites
    return jsonify({
        'username': user_id,
        'email': email,
        'favorites': user_data['favorites']
    })



# 读取HTML文件内容
with open('chat.html', 'r', encoding='utf-8') as f:
    chat_content = f.read()

with open('discover.html', 'r', encoding='utf-8') as f:
    discover_content = f.read()

with open('动态背景-萌次元.html', 'r', encoding='utf-8') as f:
    login_content = f.read()



# 简单的用户数据存储（实际项目中应使用数据库）
users_file = 'users.json'
conversations_file = 'conversations.json'

def load_users():
    """加载用户数据"""
    if os.path.exists(users_file):
        with open(users_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_users(users):
    """保存用户数据"""
    with open(users_file, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def load_conversations():
    """加载对话历史数据"""
    if os.path.exists(conversations_file):
        with open(conversations_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_conversations(conversations):
    """保存对话历史数据"""
    with open(conversations_file, 'w', encoding='utf-8') as f:
        json.dump(conversations, f, ensure_ascii=False, indent=2)

def generate_conversation_id():
    """生成新的对话ID"""
    import uuid
    return str(uuid.uuid4())[:8]

def hash_password(password):
    """密码哈希"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    """验证密码"""
    return hash_password(password) == hashed

@app.route('/')
def index():
    """主页 - 显示登录界面"""
    return login_content

@app.route('/discover')
def discover_page():
    """发现页面 - 需要登录"""
    if 'user_id' not in session:
        return redirect('/')
    return discover_content

@app.route('/chat')
def chat_page():
    """聊天界面 - 需要登录"""
    if 'user_id' not in session:
        return redirect('/')
    return chat_content



@app.route('/test-navigation')
def test_navigation():
    """跳转测试页面"""
    return send_from_directory('.', 'test-navigation.html')

@app.route('/server-status')
def server_status():
    """服务器状态检查页面"""
    return send_from_directory('.', 'server-status.html')

@app.route('/login')
def login_page():
    """登录页面"""
    return login_content

@app.route('/api/register', methods=['POST'])
def register():
    """用户注册"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        if not username or not email or not password:
            return jsonify({'error': '请填写所有字段'}), 400
        
        if len(password) < 6:
            return jsonify({'error': '密码至少需要6位'}), 400
        
        users = load_users()
        
        # 检查用户名是否已存在
        if username in users:
            return jsonify({'error': '用户名已存在'}), 400
        
        # 检查邮箱是否已存在
        for user_data in users.values():
            if user_data.get('email') == email:
                return jsonify({'error': '邮箱已被注册'}), 400
        
        # 创建新用户，自动添加 favorites 字段
        users[username] = {
            'email': email,
            'password': hash_password(password),
            'created_at': datetime.now().isoformat(),
            'favorites': []
        }
        
        save_users(users)
        
        return jsonify({
            'status': 'success',
            'message': '注册成功！请登录'
        })
        
    except Exception as e:
        print(f"Registration error: {e}")
        return jsonify({'error': '注册失败，请重试'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """用户登录"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'error': '请输入用户名和密码'}), 400
        
        users = load_users()
        
        if username not in users:
            return jsonify({'error': '用户名或密码错误'}), 401
        
        user_data = users[username]
        
        if not verify_password(password, user_data['password']):
            return jsonify({'error': '用户名或密码错误'}), 401
        
        # 设置session
        session['user_id'] = username
        session['user_email'] = user_data['email']
        
        response_data = {
            'status': 'success',
            'message': '登录成功！',
            'username': username,  # 添加用户名字段
            'redirect': '/discover'
        }
        
        print(f"Login successful for user: {username}, redirecting to: /discover")
        print(f"Response data: {response_data}")
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': '登录失败，请重试'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """用户登出"""
    session.clear()
    return jsonify({
        'status': 'success',
        'message': '已退出登录',
        'redirect': '/'
    })

@app.route('/styles.css')
def styles():
    """提供CSS文件"""
    return send_from_directory('.', 'styles.css', mimetype='text/css')

@app.route('/script.js')
def script():
    """提供JS文件"""
    return send_from_directory('.', 'script.js', mimetype='application/javascript')

@app.route('/discover.js')
def discover_script():
    """提供发现页面的JS文件"""
    return send_from_directory('.', 'discover.js', mimetype='application/javascript')

@app.route('/test.html')
def test_page():
    """提供测试页面"""
    return send_from_directory('.', 'test.html', mimetype='text/html')

@app.route('/生成二次元Logo头像.png')
def logo():
    """提供Logo图片"""
    return send_from_directory('.', '/Image/生成二次元Logo头像.png', mimetype='image/png')

@app.route('/1619235007634.png')
def chat_background():
    """提供聊天背景图片"""
    return send_from_directory('.', '/Image/1619235007634.png', mimetype='image/png')

@app.route('/bilibili-winter-view-1-w73VlYo2.jpg')
def winter_background_1():
    """提供冬季背景图片1"""
    return send_from_directory('.', '/Image/bilibili-winter-view-1-w73VlYo2.jpg', mimetype='image/jpeg')

@app.route('/bilibili-winter-view-2-Dacq7HPC.jpg')
def winter_background_2():
    """提供冬季背景图片2"""
    return send_from_directory('.', '/Image/bilibili-winter-view-2-Dacq7HPC.jpg', mimetype='image/jpeg')

@app.route('/1.jpg')
def card_background_1():
    """提供卡片背景图片1"""
    return send_from_directory('.', '/Image/1.jpg', mimetype='image/jpeg')

@app.route('/2.webp')
def card_background_2():
    """提供卡片背景图片2"""
    return send_from_directory('.', '/Image/2.webp', mimetype='image/webp')

@app.route('/3.jpg')
def card_background_3():
    """提供卡片背景图片3"""
    return send_from_directory('.', '/Image/3.jpg', mimetype='image/jpeg')

@app.route('/4.webp')
def card_background_4():
    """提供卡片背景图片4"""
    return send_from_directory('.', '/Image/4.webp', mimetype='image/webp')

# Live2D Widget 静态文件路由
@app.route('/live2d-widget-master/dist/<path:filename>')
def live2d_widget_files(filename):
    """提供Live2D Widget文件"""
    return send_from_directory('live2d-widget-master/dist', filename)

# 添加图像上传处理
@app.route('/api/upload', methods=['POST'])
def upload_image():
    """处理用户上传的图像"""
    if 'user_id' not in session:
        return jsonify({'error': '请先登录'}), 401
        
    if 'image' not in request.files:
        return jsonify({'error': '未找到图片文件'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
        
    try:
        # 创建临时文件保存上传的图片
        temp_dir = tempfile.mkdtemp()
        filename = secure_filename(file.filename)
        temp_path = os.path.join(temp_dir, filename)
        file.save(temp_path)
        
        return jsonify({
            'status': 'success',
            'image_path': temp_path,  # 使用正确的字段名
            'message': '图片上传成功'
        })
    except Exception as e:
        return jsonify({
            'error': f'图片处理失败: {str(e)}',
            'status': 'error'
        }), 500

"""处理聊天API请求 - 需要登录"""
@app.route('/chat', methods=['POST'])
@app.route('/api/chat', methods=['POST'])
def chat_api():
    """处理聊天API请求 - 需要登录"""
    if 'user_id' not in session:
        return jsonify({'error': '请先登录'}), 401

    try:
        # 打印原始请求数据用于调试
        print(f"Raw request data: {request.data}")

        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400

        user_message = data.get('message', '')
        conversation_id = data.get('conversation_id', '')

        # 获取图片路径 - 使用正确的字段名
        image_path = data.get('image_path')
        print(f"Received chat request: message={user_message}, image_path={image_path}")

        # 如果没有对话ID，创建新对话
        if not conversation_id:
            conversation_id = generate_conversation_id()

        # 调用支持多模态和个性化的推荐函数
        user_id = session['user_id']
        ai_response = get_anime_recommendation(user_message, image_path, user_id)

        # 如果返回的是生成器（流式输出），需要收集所有内容
        if hasattr(ai_response, '__iter__') and not isinstance(ai_response, str):
            response_text = ''.join(ai_response)
        else:
            response_text = str(ai_response)

        # 保存对话历史
        conversations = load_conversations()
        user_id = session['user_id']

        if user_id not in conversations:
            conversations[user_id] = {}

        if conversation_id not in conversations[user_id]:
            conversations[user_id][conversation_id] = {
                'id': conversation_id,
                'title': user_message[:30] + ('...' if len(user_message) > 30 else ''),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'messages': []
            }

        # 添加用户消息和AI回复
        conversations[user_id][conversation_id]['messages'].extend([
            {
                'type': 'user',
                'content': user_message,
                'timestamp': datetime.now().isoformat()
            },
            {
                'type': 'ai',
                'content': response_text,
                'timestamp': datetime.now().isoformat()
            }
        ])

        conversations[user_id][conversation_id]['updated_at'] = datetime.now().isoformat()
        save_conversations(conversations)

        return jsonify({
            'response': response_text,
            'status': 'success',
            'user': session['user_id'],
            'conversation_id': conversation_id
        })

    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({
            'error': f'服务器错误: {str(e)}',
            'status': 'error'
        }), 500
    
    
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    """获取用户的对话历史列表"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    
    conversations = load_conversations()
    user_id = session['user_id']
    
    if user_id not in conversations:
        return jsonify({'conversations': []})
    
    # 返回对话列表，按更新时间倒序排列
    conversation_list = []
    for conv_id, conv_data in conversations[user_id].items():
        conversation_list.append({
            'id': conv_data['id'],
            'title': conv_data['title'],
            'created_at': conv_data['created_at'],
            'updated_at': conv_data['updated_at'],
            'message_count': len(conv_data['messages'])
        })
    
    conversation_list.sort(key=lambda x: x['updated_at'], reverse=True)
    
    return jsonify({'conversations': conversation_list})

@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    """获取特定对话的详细内容"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    
    conversations = load_conversations()
    user_id = session['user_id']
    
    if user_id not in conversations or conversation_id not in conversations[user_id]:
        return jsonify({'error': '对话不存在'}), 404
    
    return jsonify({'conversation': conversations[user_id][conversation_id]})

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """删除指定对话"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    
    conversations = load_conversations()
    user_id = session['user_id']
    
    if user_id not in conversations or conversation_id not in conversations[user_id]:
        return jsonify({'error': '对话不存在'}), 404
    
    del conversations[user_id][conversation_id]
    save_conversations(conversations)
    
    return jsonify({'status': 'success', 'message': '对话已删除'})

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """创建新对话"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    
    conversation_id = generate_conversation_id()
    
    return jsonify({
        'status': 'success',
        'conversation_id': conversation_id,
        'message': '新对话已创建'
    })

@app.route('/api/user', methods=['GET'])
def get_user():
    """获取当前用户信息"""
    if 'user_id' not in session:
        return jsonify({'error': '未登录'}), 401
    
    return jsonify({
        'username': session['user_id'],  # 保持与前端一致
        'user_id': session['user_id'],
        'email': session.get('user_email', ''),
        'status': 'logged_in'
    })

@app.route('/api/text2image', methods=['POST'])
def text2image_api():
    """文生图API接口"""
    if 'user_id' not in session:
        return jsonify({'error': '请先登录'}), 401
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的请求数据'}), 400
        
        prompt = data.get('prompt', '').strip()
        if not prompt:
            return jsonify({'error': '请输入图片描述'}), 400
        
        # 调用文生图函数
        request_obj = ArkText2ImageRequest(prompt=prompt)
        result = text2image_ark(request_obj)
        
        return jsonify({
            'status': 'success',
            'image_url': result['url'],
            'prompt': prompt,
            'message': '图片生成成功'
        })
        
    except Exception as e:
        print(f"Text2Image error: {e}")
        return jsonify({
            'error': f'图片生成失败: {str(e)}',
            'status': 'error'
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({'status': 'healthy', 'message': '动漫推荐AI服务运行正常'})

# Live2D静态文件路由
@app.route('/live2d/<path:filename>')
def live2d_files(filename):
    """提供Live2D相关的静态文件"""
    return send_from_directory('live2d', filename)

# Live2D服务代理
@app.route('/live2d-demo')
def live2d_demo_proxy():
    """代理Live2D演示页面"""
    try:
        # 检查Live2D服务器是否运行
        response = requests.get('http://localhost:5000', timeout=3)
        if response.status_code == 200:
            return response.content, 200, {'Content-Type': 'text/html; charset=utf-8'}
    except requests.exceptions.RequestException as e:
        print(f"Live2D服务器连接失败: {e}")
    
    # 如果Live2D服务器未运行，返回提示页面
    return f'''
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Live2D服务器状态</title>
        <style>
            body {{
                font-family: "Noto Sans SC", Arial, sans-serif;
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                flex-direction: column; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin: 0;
                text-align: center;
            }}
            .status-container {{
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                max-width: 500px;
            }}
            pre {{
                background: rgba(0,0,0,0.3);
                padding: 15px;
                border-radius: 8px;
                color: #ffeb3b;
                text-align: left;
                margin: 20px 0;
            }}
            .refresh-btn {{
                background: #fff;
                color: #667eea;
                border: none;
                padding: 12px 24px;
                border-radius: 25px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                margin: 10px;
            }}
            .refresh-btn:hover {{
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }}
        </style>
    </head>
    <body>
        <div class="status-container">
            <h2>🌸 Live2D服务器未启动 🌸</h2>
            <p>Hiyori正在准备中，请先启动Live2D服务器：</p>
            <pre>cd live2d\\Samples\\TypeScript\\Demo
npm start</pre>
            <p>或者使用启动脚本：</p>
            <pre>双击运行 start_live2d_only.bat</pre>
            <button class="refresh-btn" onclick="location.reload()">🔄 重新检查</button>
            <button class="refresh-btn" onclick="window.history.back()">⬅️ 返回</button>
        </div>
        
        <script>
            // 每5秒自动检查一次服务器状态
            setTimeout(function() {{
                location.reload();
            }}, 5000);
        </script>
    </body>
    </html>
    '''

def start_live2d_server():
    """启动Live2D服务器"""
    live2d_path = os.path.join(os.path.dirname(__file__), 'live2d', 'Samples', 'TypeScript', 'Demo')
    if os.path.exists(live2d_path):
        try:
            # 检查Live2D服务器是否已经在运行
            try:
                response = requests.get('http://localhost:5000', timeout=2)
                if response.status_code == 200:
                    print("✅ Live2D服务器已在运行 (http://localhost:5000)")
                    return
            except requests.exceptions.RequestException:
                pass  # 服务器未运行，继续启动
            
            print("🎨 正在启动Live2D服务器...")
            subprocess.Popen(['npm', 'start'], cwd=live2d_path, shell=True)
            time.sleep(5)  # 增加等待时间确保服务器启动
            print("✨ Live2D服务器启动完成 (http://localhost:5000)")
        except Exception as e:
            print(f"❌ Live2D服务器启动失败: {e}")

# 添加全局变量来跟踪Live2D服务器状态
live2d_server_started = False

if __name__ == '__main__':
    print("🌸 启动动漫推荐AI Web服务...")
    
    # 只启动一次Live2D服务器
    if not live2d_server_started:
        live2d_thread = threading.Thread(target=start_live2d_server)
        live2d_thread.daemon = True
        live2d_thread.start()
        live2d_server_started = True
    
    print("📱 主服务器地址: http://localhost:5001")
    print("🎨 Live2D服务器地址: http://localhost:5000")
    print("✨ 请稍等Live2D服务器启动完成...")
    print("💖 享受你的二次元之旅!")
    
    # 开发模式运行
    app.run(debug=False, host='0.0.0.0', port=5001)  # 关闭debug模式避免重复启动
