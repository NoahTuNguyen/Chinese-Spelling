# Picture pack for word cards

AI-generated illustrations (Gemini), one per word, in `src/img/<toneless-pinyin>.webp`,
all 640×480 (4:3), WebP quality ~82. They show the MEANING only: no text in any image.
Generated images are used under the generator's terms; no attribution file is needed.

## Mapping (list → word → file)
| List | Word | File |
|---|---|---|
| 十四 | 空气 | kongqi.webp |
| 十四 | 岩石 | yanshi.webp |
| 十四 | 树林 | shulin.webp |
| 十四 | 草地 | caodi.webp |
| 十四 | 花园 | huayuan.webp |
| 十五 | 星星 | xingxing.webp |
| 十五 | 月亮 | yueliang.webp |
| 十五 | 彩虹 | caihong.webp |
| 十五 | 太阳 | taiyang.webp |
| 十五 | 下雨 | xiayu.webp |
| 十六 | 郊外 | jiaowai.webp |
| 十六 | 乌云 | wuyun.webp |
| 十六 | 打伞 | dasan.webp |
| 十六 | 刮风 | guafeng.webp |
| 十六 | 闪电 | shandian.webp |
| 十七 | 晴朗 | qinglang.webp |
| 十七 | 寒冷 | hanleng.webp |
| 十七 | 炎热 | yanre.webp |
| 十七 | 日历 | rili.webp |
| 十七 | 时间 | shijian.webp |
| 十八 | 月球 | yueqiu.webp |
| 十八 | 地球 | diqiu.webp |
| 十八 | 彗星 | huixing.webp |
| 十八 | 海王星 | haiwangxing.webp |
| 十八 | 天王星 | tianwangxing.webp |
| 十九 | 环保 | huanbao.webp |
| 十九 | 宇宙 | yuzhou.webp |
| 十九 | 用水 | yongshui.webp |
| 十九 | 环境 | huanjing.webp |
| 十九 | 垃圾 | laji.webp |
| 二十 | 夜空 | yekong.webp |
| 二十 | 神话 | shenhua.webp |
| 二十 | 航天 | hangtian.webp |
| 二十 | 外星人 | waixingren.webp |
| 二十 | 望远镜 | wangyuanjing.webp |

## Rules for future pictures
- File name = toneless pinyin of the word, no spaces (e.g. 望远镜 → wangyuanjing.webp).
  If two words share the same toneless pinyin, add the list id: `l21-shixian.webp`.
- 640×480 WebP; centre-crop to 4:3 if the source is another shape.
- Never any text, letters, numbers or characters in a picture.
- Within one list, pictures must look clearly different (the "picture → pick the word"
  game uses wrong answers from the same list). Known look-alikes across lists:
  环境 / 郊外 / 树林 (landscapes), 宇宙 / 夜空, 月亮 / 月球 / 神话, 晴朗 / 刮风.

## Gemini style prompt (send first in a new chat)
I'm making picture cards for a 6–8 year old learning Chinese words. For every image I ask for, follow these rules exactly:
- Flat children's picture-book illustration, soft rounded shapes, thick soft outlines
- Gentle pastel colours: mint green, sunny yellow, sky blue, peach, lilac
- One clear subject, simple plain light background (dark blue only for night or space scenes)
- Calm and friendly; children drawn as simple cartoon figures
- Landscape 4:3 format
- Generate exactly ONE picture per message. Never combine several pictures into a sheet or grid.
- ABSOLUTELY NO text of any kind: no letters, numbers, Chinese characters, file names, captions, labels, signs or logos
Keep the same style for every image in this chat. Reply with just the image. Ready?

Then one message per word: `Image: <scene description>. One picture only, no text.`
