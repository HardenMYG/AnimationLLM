import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from langchain_community.embeddings.dashscope import DashScopeEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph
from typing_extensions import List, TypedDict
from langchain_core.documents import Document
import base64
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, File, UploadFile

# 常量定义
INDEX_DIR = "anime_faiss_index"  # 索引存储目录
DATA_FILE = 'anime_data.json'  # 原始数据文件

class ArkText2ImageRequest(BaseModel):
    prompt: str

# 加载环境变量
try:
    load_dotenv()
except ImportError:
    pass

# 豆包API设置 - 统一使用多模态模型
ARK_API_KEY = os.getenv("ARK_API_KEY", "")
MULTIMODAL_MODEL = "doubao-seed-1-6-250615"  # 统一的多模态模型

# 初始化OpenAI客户端
client = OpenAI(
    api_key=ARK_API_KEY,
    base_url="https://ark.cn-beijing.volces.com/api/v3"
)

os.environ["DASHSCOPE_API_KEY"] = ""
embeddings = DashScopeEmbeddings(model="text-embedding-v1")

def load_anime_data():
    """加载原始动漫数据"""
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def create_documents(anime_data):
    """将原始数据转换为文档对象"""
    all_docs = []
    MAX_EMBED_LENGTH = 2048
    for anime in anime_data:
        studios = [studio['name'].lower() for studio in anime['studios']['nodes']]

        # 提取图片URL，常见字段 coverImage 或 image_url
        image_url = None
        if 'coverImage' in anime and 'large' in anime['coverImage']:
            image_url = anime['coverImage']['large']
        elif 'image_url' in anime:
            image_url = anime['image_url']

        content_parts = [
            f"Title: {anime['title']['english'] or anime['title']['romaji']}",
            f"Native Title: {anime['title']['native']}",
            f"Description: {anime['description']}",
            f"Genres: {', '.join(anime['genres'])}",
            f"Tags: {', '.join([tag['name'] for tag in anime['tags']])}",
            f"Average Score: {anime['averageScore']}",
            f"Popularity: {anime['popularity']}",
            f"Release Date: {anime['startDate']['year']}-{anime['startDate']['month']}",
            f"Episodes: {anime['episodes']}",
            f"Duration: {anime['duration']} minutes",
            f"Studios: {', '.join(studios)}",
            f"Image URL: {image_url if image_url else 'N/A'}"
        ]
        page_content = "\n".join(content_parts)
        if len(page_content) > MAX_EMBED_LENGTH:
            page_content = page_content[:MAX_EMBED_LENGTH]
        metadata = {
            "title": anime['title']['english'] or anime['title']['romaji'],
            "genres": anime['genres'],
            "tags": [tag['name'] for tag in anime['tags']],
            "score": anime['averageScore'],
            "popularity": anime['popularity'],
            "year": anime['startDate']['year'],
            "studios": studios,
            "image_url": image_url
        }
        all_docs.append(Document(page_content=page_content, metadata=metadata))
    return all_docs

def create_search_metadata(docs):
    """为文档创建搜索元数据"""
    for doc in docs:
        metadata = doc.metadata
        metadata["search_keywords"] = (
            f"{metadata['title']} "
            f"{'/'.join(metadata['genres'])} "
            f"{'/'.join(metadata['tags'])} "
            f"{'/'.join(metadata['studios'])} "
            f"{metadata['year']}"
        ).lower()

        metadata["clean_content"] = (
            f"标题: {metadata['title']}\n"
            f"类型: {', '.join(metadata['genres'])}\n"
            f"标签: {', '.join(metadata['tags'])}\n"
            f"工作室: {', '.join(metadata['studios'])}\n"
            f"年份: {metadata['year']}\n"
            f"评分: {metadata['score']}\n"
            f"简介: {doc.page_content.split('Description: ')[1].split('\n')[0] if 'Description: ' in doc.page_content else ''}"
        )
    return docs

def get_vector_store():
    """获取或创建持久化向量存储"""
    # 检查索引是否存在
    if os.path.exists(INDEX_DIR) and os.listdir(INDEX_DIR):
        print(f"加载现有索引: {INDEX_DIR}")
        return FAISS.load_local(INDEX_DIR, embeddings, allow_dangerous_deserialization=True)

    print("创建新索引...")
    # 加载并处理数据
    anime_data = load_anime_data()
    anime_docs = create_documents(anime_data)
    processed_docs = create_search_metadata(anime_docs)

    # 创建FAISS索引
    vector_store = FAISS.from_documents(processed_docs, embeddings)

    # 保存索引到本地
    vector_store.save_local(INDEX_DIR)
    print(f"已保存索引到: {INDEX_DIR}")
    return vector_store

def build_anime_recommender(vector_store):
    """构建推荐系统"""
    template = """你是一个资深的动漫爱好者兼推荐专家。请根据用户的要求和以下动漫信息，以动漫迷的视角为用户提供推荐和相关信息：

        {context}

        用户询问：{question}

        请按照以下结构和风格回复：

        ### 🎌 推荐理由（动漫迷视角）
        用热情洋溢的语气解释为什么推荐这些动漫，可以包含：
        - 制作亮点（如ufotable的作画、WIT Studio的立体机动等）
        - 在动漫圈内的口碑和地位
        - 个人观感评价（以动漫迷角度）
        - 适合什么类型的观众

        ### 🔥 推荐作品详情
        为每个推荐作品提供丰富信息：
        1. 《作品名称》 (类型)
        - 制作公司：XXX
        - 播出时间：XXXX年
        - 豆瓣/MyAnimeList评分：X.X
        - 核心看点：2-3个最突出的亮点
        - 经典场景/名场面：简要描述1-2个
        - 观看建议：最佳观看平台/最佳观看顺序（如有系列作）

        2. 《作品名称》 (类型)
        [同上格式]

        ### 💡 深度延伸
        根据用户查询延伸相关信息：
        - 如果是特定公司：介绍该公司风格/代表作品/业界地位
        - 如果是类型/题材：介绍该类型发展史/经典作品
        - 如果是年代：介绍该年代动画特点
        - 相关制作人员（监督/脚本/音乐等）的其他知名作品

        ### 🌟 个性化建议
        - 观看顺序建议（如有系列）
        - 类似风格的其他作品
        - 观看前的小贴士
        - 可能会喜欢的其他元素

        请用活泼但专业的动漫爱好者语气，适当使用emoji和动漫圈术语，但保持信息准确。回复语言与用户查询一致。"""

    prompt = PromptTemplate.from_template(template)

    class State(TypedDict):
        question: str
        context: List[Document]
        answer: str

    def retrieve(state: State):
        query = state["question"].lower()
        studio_keywords = ["studio", "公司", "制作"]

        if any(keyword in query for keyword in studio_keywords):
            # 尝试提取工作室名称
            studio_name = None
            for word in query.split():
                if word.lower() in ["ufotable", "飞碟社"]:
                    studio_name = "ufotable"
                    break

            if studio_name:
                # 使用元数据过滤
                all_docs = vector_store.docstore._dict.values()
                studio_docs = [
                    doc for doc in all_docs
                    if studio_name in doc.metadata.get("studios", [])
                ]
                return {"context": studio_docs[:5]}

        # 普通相似度搜索
        retrieved_docs = vector_store.similarity_search(state["question"], k=5)
        return {"context": retrieved_docs}

    def generate(state: State):
        if not state["context"]:
            return {"answer": "没有找到符合要求的动漫作品，请尝试其他查询条件。"}

        docs_content = "\n\n".join(doc.page_content for doc in state["context"])
        prompt_value = prompt.invoke({
            "question": state["question"],
            "context": docs_content
        })

        messages = prompt_value.to_messages()
        messages.insert(0, SystemMessage(content="请确保输出格式正确，不要重复任何部分。"))

        # 转换为OpenAI格式的消息
        openai_messages = []
        for msg in messages:
            if isinstance(msg, SystemMessage):
                openai_messages.append({"role": "system", "content": msg.content})
            elif isinstance(msg, HumanMessage):
                openai_messages.append({"role": "user", "content": msg.content})

        # 使用多模态模型生成推荐
        try:
            # 使用非流式响应，避免生成器问题
            response = client.chat.completions.create(
                model=MULTIMODAL_MODEL,
                messages=openai_messages,
                max_tokens=2000,
                temperature=0.7,

            )
            return {"answer": response.choices[0].message.content}
        except Exception as e:
            return {"answer": f"API调用错误: {str(e)}"}

    # 定义END节点函数
    def end_node(state: State):
        return state

    graph_builder = StateGraph(State)
    graph_builder.add_node("retrieve", retrieve)
    graph_builder.add_node("generate", generate)
    graph_builder.set_entry_point("retrieve")
    graph_builder.add_edge("retrieve", "generate")

    END = "END"
    graph_builder.add_node(END, end_node)
    graph_builder.add_edge("generate", END)

    return graph_builder.compile()

# 初始化系统
print("正在初始化动漫推荐系统...")
vector_store = get_vector_store()  # 获取持久化向量存储
anime_recommender = build_anime_recommender(vector_store)
print("系统初始化完成！")

def recognize_anime_image(image_path):
    """使用豆包多模态模型识别动漫图片内容"""
    try:
        # 读取并编码图像
        with open(image_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode("utf-8")
        
        # 构建多模态请求（修正后的格式）
        response = client.chat.completions.create(
            model=MULTIMODAL_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",  # 添加type字段
                            "image_url": {
                                "url": f"data:image/png;base64,{image_data}"
                            }
                        },
                        {
                            "type": "text",  # 添加type字段
                            "text": "请识别图片中的动漫相关内容，包括角色、作品、场景等。"
                        }
                    ]
                }
            ],
            max_tokens=1000
        )
        
        return response.choices[0].message.content
    except Exception as e:
        print(f"图像识别错误: {str(e)}")
        return "无法识别此图片内容"

# 修改推荐函数以支持多模态输入
def get_anime_recommendation(query, image_path=None, user_id=None):
    # 个性化推荐：读取用户喜欢的作品
    favorites_text = ""
    if user_id:
        try:
            with open("users.json", "r", encoding="utf-8") as f:
                users = json.load(f)
            user_data = users.get(user_id, {})
            favorites = user_data.get("favorites", [])
            if favorites:
                favorites_text = f"\n用户喜欢的作品：{', '.join(favorites)}"
        except Exception as e:
            print(f"读取用户喜欢的作品失败: {e}")

    # 如果有图像输入，先识别图片，再将识别结果与文本拼接后走RAG推荐
    if image_path and os.path.exists(image_path):
        print(f"正在识别上传的图片: {image_path}")
        try:
            image_description = recognize_anime_image(image_path)
            print(f"图片识别结果: {image_description}")
            final_query = f"图片内容：{image_description}\n用户问题：{query}{favorites_text}"
            result = anime_recommender.invoke({"question": final_query})
            return result["answer"]
        except Exception as e:
            print(f"图片识别失败: {str(e)}")
            return "图片识别失败"
    else:
        # 无图片时走RAG推荐
        final_query = f"{query}{favorites_text}"
        result = anime_recommender.invoke({"question": final_query})
        return result["answer"]

def text2image_ark(request: ArkText2ImageRequest):
    """
    Ark文生图接口
    请求参数: prompt 文本描述
    返回: 图片URL
    """
    try:
        anime_style_hint = "画风：二次元动漫风格，明亮色彩，精致线条，唯美背景。"
        client = OpenAI(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=os.environ.get("api_key","cd2f80e0-0254-4d1e-86bf-593585203d5b"),
        )
        response = client.images.generate(
            model="ep-20250717143642-d5b6v",  # 请替换为你的Ark推理接入点ID
            prompt=f"{request.prompt}\n{anime_style_hint}",
            size="1024x1024",
            response_format="url"
        )
        url = response.data[0].url if response and response.data and response.data[0].url else None
        if url:
            return {"url": url}
        else:
            raise Exception("Ark图片生成失败")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ark文生图失败: {e}")
                            
if __name__ == "__main__":
    while True:
        user_input = input("\n请输入你想看的动漫相关信息（输入'退出'结束）：\n> ")
        if user_input.lower() in ["退出", "exit", "quit"]:
            break

        print("\n正在为你推荐...")
        recommendation = get_anime_recommendation(user_input)
        print("\n推荐结果：")
        print(recommendation)
        print("\n" + "=" * 50)
