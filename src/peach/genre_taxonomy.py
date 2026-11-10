"""外部来源 genre 到 Peach 内容标签的唯一映射位点。

不碰数据库、不碰 HTTP，和 `catalog_rules` 一样是纯策略层。

之前每个抓取脚本各带一份表：`scrape_codes.py` 只认 r18dev 的英文 genre，
`fetch_fc2_metadata.py` 只认 FC2 商品页的日文标签。结果是 dmm、mgstage、
dlgetchu 这些**日文官方来源**在 policy 里排在 tag 字段第一位，实际却一个标签
也产不出来——它们返回的全是日文，英文表一个都对不上，候选被静默丢掉。

三类结果必须分开，不能混成「没有」：

- 命中 `CONTENT_GENRES`：投影到 Peach 现有词表。
- 命中 `NON_CONTENT_GENRES`：来源确实给了值，但它描述的是画质、发行、促销或
  演员编成，不是内容。**明确排除**，不进候选也不算遗漏。
- 两边都不命中：`map_genres` 把原文回传给调用方登记。未收录不等于非内容，
  要么补进表里，要么补进排除表，不允许长期停在「不知道」。

第三类的出口在复核页：用户当场给一个中文标签，或者判它不是内容，结论落进
`genre_decision`（迁移 0026）。这个模块仍然不碰数据库——决定由调用方读出来，
按 `decisions` 参数传进 `map_genres`，查表时排在两张静态表前面。
"""
from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Mapping



#: 来源原文 -> Peach 标签。只投影到 `catalog_rules` 已有的词表，不凭翻译造新标签。
#: 键混合英文（r18dev、aventertainment）与日文（dmm、mgstage、dlgetchu、libredmm），
#: 查表前统一走 `normalise_genre`，所以大小写与全半角写法不必在这里穷举。
#: r18dev 的英文名是 DMM 分类的译名，按同一分类编号跟着日文名走，对照见
#: `docs/reference-snapshots/r18dev-genre-categories.md`；日文名还没收录的，英文名也不先收。
CONTENT_GENRES: dict[str, str] = {
    # —— 行为 ——
    "Creampie": "Creampie", "Creampies": "Creampie", "中出し": "Creampie",
    "中出": "Creampie", "生中出し": "Creampie", "生ハメ": "Creampie",
    "Cream Pies": "Creampie", "No Condom": "Creampie",
    "Blowjob": "Oral", "Blow Job": "Oral", "Oral": "Oral", "Oral Sex": "Oral",
    "フェラ": "Oral", "フェラチオ": "Oral", "口交": "Oral",
    # FC2 卖家把口交的姿势与花样各写成一格：站着的、骑在身上的、不用手的，说的都是口交。
    # 单写的 `仁王立ち` 在来源里是 `…フェラ` 的省写。
    "フェラ抜き": "Oral", "口淫": "Oral",
    # 射精后把阴茎舔干净是单独一格；单写的 `お掃除`、`掃除` 是 `お掃除フェラ` 的省写。
    "お掃除フェラ": "Cleanup blowjob", "お掃除": "Cleanup blowjob", "掃除": "Cleanup blowjob",
    "ノーハンド": "Oral", "ノーハンドフェラ": "Oral", "仁王立ち": "Oral", "仁王立ちフェラ": "Oral",
    "馬乗りフェラ": "Oral", "バキュームフェラ": "Oral", "激しいフェラ": "Oral", "交互フェラ": "Oral",
    "Wフェラ": "Oral", "ご奉仕フェラ": "Oral", "包茎フェラ": "Oral", "ゴムフェラ": "Oral",
    "フェラ顔": "Oral", "フェラポーズ": "Oral", "フェラ撮影会": "Oral",
    "チンポ舐め": "Oral", "玉舐め": "Oral", "金玉舐め": "Oral", "裏筋": "Oral", "裏筋舐め": "Oral",
    "Deep Throat": "Deep throat", "Deepthroat": "Deep throat", "Iramatio": "Deep throat",
    "Irrumatio": "Deep throat", "イラマチオ": "Deep throat", "ディープスロート": "Deep throat",
    "Cunnilingus": "Cunnilingus", "Pussy Licking": "Cunnilingus", "クンニ": "Cunnilingus",
    "クンニリングス": "Cunnilingus",
    "Facial": "Facial", "Facials": "Facial", "顔射": "Facial", "BUKKAKE": "Facial",
    "ぶっかけ": "Facial", "Bukkake/Facial": "Facial", "大量顔射": "Facial",
    "Oral Cum": "Cum in mouth", "Cum in Mouth": "Cum in mouth", "口内発射": "Cum in mouth", "口内射精": "Cum in mouth",
    "舌上発射": "Cum in mouth", "舌上射精": "Cum in mouth",
    "Cum Swallowing": "Swallowing", "Cum Swallow": "Swallowing", "Swallowing": "Swallowing",
    "Swallow": "Swallowing", "ごっくん": "Swallowing", "飲精": "Swallowing", "精飲": "Swallowing",
    # `射精` 说的是射了几回、射了多少，射在哪里另有口爆、颜射、中出内射三格。
    "2回射精": "Ejaculation", "大量射精": "Ejaculation", "大量発射": "Ejaculation", "大量精子": "Ejaculation",
    "ザーメン発射": "Ejaculation", "大噴射": "Ejaculation", "精子を大噴射": "Ejaculation", "特濃ザーメン": "Ejaculation",
    # `早漏` 那一格拍的是男方忍不住很快射出来，看点同样落在射精上。
    "早漏": "Ejaculation", "Premature Ejaculation": "Ejaculation",
    # `搾り取る` 是女方主动把男方榨到射；FC2 的标签是从标题截的，同一个词留下好几种长短。
    "精子を搾り取": "Milking", "精子を搾り取って": "Milking", "精子を搾り": "Milking", "搾り取": "Milking",
    "ザーメン搾り取": "Milking", "精液搾り": "Milking",
    # `指マン`／`手マン` 是同一个动作的两种写法，来源里两种都出现。
    "Handjob": "Handjob", "Hand Job": "Handjob", "Fingering": "Handjob", "手コキ": "Handjob",
    "指マン": "Handjob", "手マン": "Handjob",
    "Titty Fuck": "Titfuck", "Tit Fuck": "Titfuck", "Titjob": "Titfuck", "Paizuri": "Titfuck",
    "パイズリ": "Titfuck", "挟射": "Titfuck", "馬乗りパイズリ": "Titfuck", "着衣パイズリ": "Titfuck",
    "Footjob": "Footjob", "Foot Job": "Footjob", "足コキ": "Footjob",
    "Squirting": "Squirting", "Squirts": "Squirting", "Squirt": "Squirting", "潮吹き": "Squirting", "潮吹き娘": "Squirting",
    "母乳": "Breast milk", "Lactation": "Breast milk", "スカトロ": "Scat", "Scat": "Scat", "浣腸": "Scat",
    "Breast Milk": "Breast milk", "Enema": "Scat",
    "フィストファック": "Fisting", "フィスト": "Fisting", "Fisting": "Fisting",
    "W姦": "Group", "生姦": "Creampie", "高速騎乗位": "Riding",
    # `生` 说的是不戴套，和 `生ハメ` 同去向；FC2 标题里写成 `【生中】`。
    "濃厚中出し": "Creampie", "膣内射精": "Creampie", "半外半中出し": "Creampie",
    "ザーメン注入": "Creampie", "生セックス": "Creampie", "生SEX": "Creampie",
    "生挿入": "Creampie", "生": "Creampie",
    "オナホール": "Sex Toys", "ギャプ萌え": "Gap moe",
    # `即ハメ` 是见面不做前戏就插入；`オナサポ` 是女方对着镜头说话、指挥观众自慰，看点在台词。
    "即ハメ": "No foreplay", "Quickie": "No foreplay",
    "オナサポ": "Dirty talk", "Masturbation Support": "Dirty talk",
    "Masturbation": "Masturbation", "Masterbation": "Masturbation", "オナニー": "Masturbation",
    "Anal Sex": "Anal", "Anal Play": "Butthole", "Anal": "Butthole",
    "アナル": "Butthole", "アナルセックス": "Anal",
    # `アナル中出し` 一个原文只投一个标签，取更能分开馆藏的肛交；`AF`、`ATM` 是圈内缩写。
    "アナルファック": "Anal", "AF": "Anal", "ATM": "Anal", "アナル中出し": "Anal",
    "アナル責め": "Butthole", "アナルシリーズ": "Butthole",
    "アナル舐め": "Rimjob", "亀頭責め": "Glans teasing", "2穴挿入": "Double penetration",
    "腋コキ": "Armpits", "わき": "Armpits", "腋見せフェチ": "Armpits",
    "正常位": "Missionary", "ピストン": "Pounding", "ガン突き": "Pounding",
    "Cowgirl": "Riding", "Reverse Cowgirl": "Riding", "Girl on Top": "Riding",
    "Woman on Top": "Riding", "騎乗位": "Riding", "馬乗り": "Riding",
    "Doggystyle": "Doggy style", "Doggy Style": "Doggy style", "Doggy-Style": "Doggy style", "Doggy": "Doggy style",
    "Strong Doggy Style": "Doggy style", "Standing Doggy Style": "Doggy style",
    "バック": "Doggy style", "後背位": "Doggy style",
    # 男方站着把女方抱起来做；aventertainment 的英文 genre 写 `Lunch Box Fuck`。
    "駅弁": "Ekiben position", "駅弁ファック": "Ekiben position", "Lunch Box Fuck": "Ekiben position",
    "POV": "POV", "Gonzo": "POV", "主観": "POV", "ハメ撮り": "POV",
    "主觀視角": "POV", "生ハメ撮り": "POV",
    "Threesome / Foursome": "Group", "Threesome": "Group", "Foursome": "Group",
    "3P・4P": "Group", "3P/4P": "Group", "3P": "Group", "4P": "Group",
    "Orgy": "Group", "Gangbang": "Group", "Gang Bang": "Group", "Group Sex": "Group",
    "乱交": "Group", "G*******g": "Group", "Harem": "Group", "ハーレム": "Group",
    "Lesbian": "Yuri / GL", "Lesbians": "Yuri / GL", "レズ": "Yuri / GL", "レズビアン": "Yuri / GL",
    "レズキス": "Yuri / GL",
    "Double Penetrations": "Double penetration", "Double Penetration": "Double penetration",
    "Kiss": "Kissing", "Kissing": "Kissing", "キス": "Kissing", "キス・接吻": "Kissing", "接吻": "Kissing",
    "Kiss Kiss": "Kissing",
    "Sitting on Face": "Face sitting", "Facesitting": "Face sitting", "Face Sitting": "Face sitting",
    "顔面騎乗": "Face sitting",
    "69": "69", "シックスナイン": "69",
    "Peeing": "Pissing", "Pissing": "Pissing", "Golden Shower": "Pissing", "放尿": "Pissing",
    "おしっこ": "Pissing", "お漏らし": "Pissing", "小便": "Pissing", "放尿・お漏らし": "Pissing", "Urination": "Pissing",
    # `局部アップ` 说的是镜头怎么给，和 `射精特写` 同一类；来源把它当 genre 写。
    "局部アップ": "Close-up", "Close Up": "Close-up", "Close-Up": "Close-up", "Genital Close-Up": "Close-up",
    "アップ": "Close-up",
    # 器具的名字分得很细——`バイブ` 是震动棒、`ローター` 是跳蛋、`電マ` 是电动按摩棒
    # ——但馆藏里每种各压一到五条，分成三个标签只会得到三个筛不动的稀标签。
    # 片假名 `オモチャ` 与平假名 `おもちゃ` 是同一个词，NFKC 不折叠假名，两种都登记。
    "Sex Toy": "Sex Toys", "Sex Toys": "Sex Toys", "Adult Toys": "Sex Toys", "Toys": "Sex Toys",
    "大人のおもちゃ": "Sex Toys", "おもちゃ": "Sex Toys", "オモチャ": "Sex Toys",
    "Vibrator": "Sex Toys", "Big Vibrator": "Sex Toys", "Egg Vibrator": "Sex Toys",
    "Dildo": "Sex Toys", "ディルド": "Sex Toys",
    "Pinkrotor": "Sex Toys", "Pink Rotor": "Sex Toys", "ピンクローター": "Sex Toys",
    "バイブ": "Sex Toys", "ローター": "Sex Toys", "電マ": "Sex Toys",
    "オナホ": "Sex Toys", "オナホコキ": "Sex Toys", "ローター責め": "Sex Toys", "ペニスポンプ": "Sex Toys",
    "コックリング": "Sex Toys", "アナルプラグ": "Sex Toys", "アナルしっぽ": "Sex Toys",
    # `異物挿入` 塞进去的是器具以外的东西，筛的人找的是同一类画面，不单开一格。
    "異物挿入": "Sex Toys", "Object Insertion": "Sex Toys",
    # `くぱぁ` 是把阴部掰开给镜头看，说的是镜头怎么给，和 `局部アップ` 同一格。
    "くぱぁ": "Close-up",

    # —— 体貌 ——
    "Big Tits": "Big Breasts", "Big Tits Lover": "Big Breasts", "Big Boobs": "Big Breasts", "Busty": "Big Breasts",
    "巨乳": "Big Breasts", "Fカップ": "Big Breasts",
    # 大小只有一档（`catalog_rules.RETIRED_TAGS` 里写了为什么），「爆」「美」都归到这里。
    "Huge Tits": "Big Breasts", "Huge Boobs": "Big Breasts", "爆乳": "Big Breasts", "Hカップ": "Big Breasts",
    "美巨乳": "Big Breasts", "天然美巨乳": "Big Breasts", "美爆乳": "Big Breasts", "美貧乳": "Small breasts",
    "Beautiful Tits": "Beautiful Breasts", "Beautiful Breasts": "Beautiful Breasts", "Nice Tits": "Beautiful Breasts", "美乳": "Beautiful Breasts",
    "Small Tits": "Small breasts", "Tiny Tits": "Small breasts", "Flat Chest": "Small breasts",
    "貧乳": "Small breasts", "貧乳・微乳": "Small breasts", "微乳": "Small breasts", "ちっぱい": "Small breasts",
    # 乳型一种一个标签：来源说到乳晕、乳头还是形状，就取到那一级。
    "ガリボイン": "Slim and busty", "ロケット乳": "Rocket tits", "尖がりオッパイ": "Pointy breasts",
    "垂れ乳": "Sagging breasts", "垂れ長乳": "Long sagging breasts", "エロ乳房": "Erotic breasts",
    "美乳輪": "Pretty areola", "美人輪": "Pretty areola", "巨乳輪": "Large areola", "巨大乳輪": "Large areola",
    "デカ乳輪": "Large areola", "パフィーニップル": "Puffy areola",
    "エロ乳首": "Erotic nipples", "デカ乳首": "Large nipples", "美乳首": "Pretty nipples",
    "陥没乳首": "Inverted nipple", "陥没チクビ": "Inverted nipple", "勃起乳首": "Erect nipples",
    "敏感乳首": "Sensitive nipples", "黒乳首": "Dark nipples", "長乳首": "Long nipples",
    "偽乳": "Breast implants", "偽乳(豊胸乳)": "Breast implants", "豊胸": "Breast implants", "豊胸乳": "Breast implants",
    "Ass Lover": "Nice butt", "Butt": "Nice butt", "Nice Ass": "Nice butt",
    "美尻": "Nice butt", "尻": "Nice butt", "お尻": "Nice butt", "尻フェチ": "Nice butt",
    # `巨尻` 说的是大，`美尻` 说的是好看，和 `巨乳`／`美乳` 一样分两格。
    # r18dev 把 DMM 的 `巨尻` 译作 `Big Asses`，它跟着 `巨尻` 走。
    "巨尻": "Big ass", "美巨尻": "Big ass", "デ●尻": "Big ass", "Big Asses": "Big ass", "Big Ass": "Big ass",
    "Legs": "Beautiful legs", "Beautiful Leg": "Beautiful legs", "Beautiful Legs": "Beautiful legs", "Nice Legs": "Beautiful legs",
    "美脚": "Beautiful legs",
    # `Foot Fetish`／`足フェチ` 说的是恋足，不是腿好看。两者投影到同一个标签的话，
    # 「找恋足题材」和「找美腿出镜」在检索上就再也分不开。
    "Foot Fetish": "Foot fetish", "足フェチ": "Foot fetish", "脚フェチ": "Foot fetish", "Feet": "Foot fetish", "足": "Foot fetish",
    "足の裏": "Foot fetish", "足裏": "Foot fetish", "足指": "Foot fetish",
    "Slender": "Slim", "Slim": "Slim", "Skinny": "Slim", "スレンダー": "Slim",
    "細身": "Slim", "苗條": "Slim",
    "Chubby": "Plump", "Plump": "Plump", "ぽっちゃり": "Plump", "むっちり": "Plump",
    "Glamorous Body": "Plump", "グラマー": "Plump", "グラマラス": "Plump",
    # `苗条` 说的是身材细，`娇小` 说的是个子小，两件事在检索上分得开。
    # `ミニマム` 是 MGS 给小个子开的格子。
    "Tiny Girl": "Petite", "Petite": "Petite", "小柄": "Petite", "低身長": "Petite",
    "ミニマム": "Petite",
    # `ミニ系` 也是小个子那一格，r18 把它译成 `Youthful`。
    "ミニ系": "Petite", "Youthful": "Petite",
    # `高身長グラマラス` 是 LUXU 系列的固定格子，说的是「个子高、身材丰腴」。
    # 一个原文只能投一个标签，取更能分开馆藏的那一半；丰腴那一半靠单独出现的
    # `Glamorous Body` 收。
    "Tall Girl": "Tall", "Tall": "Tall", "長身": "Tall", "高身長": "Tall",
    "高身長グラマラス": "Tall",
    "Beautiful Skin": "Beautiful skin", "美肌": "Beautiful skin", "美肌・美白": "Beautiful skin",
    "Ahegao": "Ahegao", "アヘ顔": "Ahegao",
    "Sweaty": "Sweaty", "Sweat": "Sweaty", "Sweating": "Sweaty", "汗だく": "Sweaty", "汗": "Sweaty",
    "Nice Pussy": "Pretty pussy", "Beautiful Pussy": "Pretty pussy", "美マン": "Pretty pussy", "スジマン": "Pretty pussy",
    "Big Cock": "Large Cock", "Big Dick": "Large Cock", "巨根": "Large Cock", "デカチン": "Large Cock", "巨ちん": "Large Cock",
    "デカチン・巨根": "Large Cock", "Huge Dick - Large Dick": "Large Cock",
    # `美少女`、`美女`、`美人` 说的都是好看，没有分得开的区别，归一个「高颜值」；
    # `清楚` 说的是清纯干净的气质，`かわいい` 说的是可爱，这两种和好看不是一回事。
    # 词尾的 `系` 只说「这一类」，和本词同去向。`Neat and Clean` 是 r18 对 `清楚` 的英译。
    "Beautiful Girl": "Gorgeous", "Beauty": "Gorgeous",
    "美少女": "Gorgeous", "美少女系": "Gorgeous", "美女": "Gorgeous", "美人": "Gorgeous",
    "美人名女優": "Gorgeous", "美顔": "Gorgeous", "Pretty Face": "Gorgeous", "Pretty Girl": "Gorgeous",
    "清楚": "Innocent", "清楚系": "Innocent", "清純": "Innocent", "清純系": "Innocent", "Neat and Clean": "Innocent",
    "可愛い": "Cute", "かわいい": "Cute", "可愛い系": "Cute", "かわいい系": "Cute", "Cute": "Cute",
    "激カワ": "Cute",
    "剛毛": "Hairy", "天然陰毛": "Hairy", "陰毛あり": "Hairy", "未処理マ○毛": "Hairy", "尻毛": "Hairy",
    "色白": "Fair skin", "美白": "Fair skin", "白い肌": "Fair skin", "Light Skin": "Fair skin",
    "くびれ": "Slim waist", "クビレ": "Slim waist",
    "ダイナマイトボディ": "Hot body", "ダイナマイトボディー": "Hot body", "エロボディ": "Sexy figure",
    # `ぽっちゃり` 说肉感（丰满），`ぽちゃ`／`ややぽちゃ` 说的是有点胖。
    "ぽちゃ": "Slightly chubby", "ややポチャ": "Slightly chubby", "ややぽちゃ": "Slightly chubby",
    "軟体": "Flexible", "腰が柔らかい": "Flexible", "Y字バランス": "Flexible", "Flexible body": "Flexible",
    "ハーフ": "Mixed race", "タトゥー": "Tattoo", "刺青": "Tattoo",
    "ビラマン": "Large labia", "デカビラ": "Large labia", "グロマン": "Dark privates", "名器": "Meiki",
    "アニメ声": "Anime voice", "可愛い声": "Doll voice", "腹筋": "Abs", "黒髪": "Black hair",
    "筋肉": "Abs", "Muscular": "Abs",
    # `ポルチオ` 说的是深处一碰就高潮，和 `敏感` 同一格。
    "敏感": "Sensitive body", "ポルチオ": "Sensitive body", "G-Spot": "Sensitive body",
    "Shaved Pussy": "Shaved", "Shaved": "Shaved", "パイパン": "Shaved", "ぱいぱん": "Shaved",
    "剃毛": "Shaved",
    "そっくりさん": "Celebrity lookalike", "Lookalike": "Celebrity lookalike",
    "猫耳": "Cat ears",
    "Glasses": "Glasses", "眼鏡": "Glasses", "メガネ": "Glasses", "めがね": "Glasses",

    # —— 着装 ——
    "Pantyhose": "Stockings", "Stockings": "Stockings", "パンスト・タイツ": "Stockings",
    "パンスト": "Stockings", "タイツ": "Stockings", "ストッキング": "Stockings",
    "ニーソックス": "Stockings", "黒パンスト": "Stockings", "Net tights": "Stockings", "網タイツ": "Stockings",
    "Uniform": "Uniform", "Uniforms": "Uniform", "Academy Uniform": "Uniform", "School Uniform": "Uniform",
    "Sailor Uniform": "Uniform", "制服": "Uniform", "セーラー服": "Uniform", "学生服": "Uniform",
    "セーラー": "Uniform",
    # `スーツ` 在来源里配的是 OL 那一身（`OLスーツ`），和角色那一格 `秘书OL` 分开记穿着。
    "スーツ": "Office uniform", "ビジネススーツ": "Office uniform", "Business Suit": "Office uniform",
    "ミニスカ": "Miniskirt", "Miniskirt": "Miniskirt",
    "Lingerie": "Erotic lingerie", "Underwear": "Erotic lingerie", "ランジェリー": "Erotic lingerie",
    "下着": "Erotic lingerie", "猫ランジェリー": "Erotic lingerie", "コルセット": "Erotic lingerie",
    # `ボンテージ` 是皮革与漆皮的束身装，`エナメル` 说的是同一种漆皮料子。
    "ボンテージ": "Leather outfit", "エナメル": "Leather outfit",
    "Swimsuit": "Swimsuit", "Swimsuits": "Swimsuit", "School Swimsuits": "Swimsuit",
    "Bikini": "Swimsuit", "水着": "Swimsuit", "スクール水着": "Swimsuit", "ビキニ": "Swimsuit",
    "競泳水着": "Swimsuit",
    "Leotards": "Gym uniform", "Gym Clothes": "Gym uniform", "ブルマ": "Gym uniform",
    "体操着・ブルマ": "Gym uniform", "レオタード": "Gym uniform", "体操着": "Gym uniform", "体操服": "Gym uniform",
    "Bunny Girl": "Bunny girl", "バニーガール": "Bunny girl", "バニー": "Bunny girl",
    "Chinese Dress": "Cheongsam / Hanfu", "チャイナドレス": "Cheongsam / Hanfu",
    "Bride": "Wedding dress", "Wedding Dress": "Wedding dress", "花嫁": "Wedding dress", "ウェディングドレス": "Wedding dress",
    "Kimono": "Kimono / Yukata", "Yukata": "Kimono / Yukata", "着物": "Kimono / Yukata", "浴衣": "Kimono / Yukata",
    "和服・浴衣": "Kimono / Yukata", "着物・浴衣": "Kimono / Yukata",
    "Twintails": "Twin tails", "Twin Tails": "Twin tails", "Pigtails": "Twin tails", "ツインテール": "Twin tails",
    "ツインテー": "Twin tails",
    "Blonde": "Blonde", "Blond": "Blonde", "Blonde Hair": "Blonde", "金髪": "Blonde",
    "ブロンド": "Blonde", "金髪・ブロンド": "Blonde",
    "Short Hair": "Short hair", "ショートヘア": "Short hair", "ショートカット": "Short hair", "短髪": "Short hair",
    "High Heels": "High Heels", "ハイヒール": "High Heels",
    "Cosplay": "Role Play", "コスプレ": "Role Play", "コスプレ一般": "Role Play",
    "Role Play": "Role Play",
    # 扮成什么的那几格：`コス` 是 `コスプレ` 的省写，`アニコス` 是动漫角色的扮装。
    "コス": "Role Play", "コスチューム": "Role Play", "アニコス": "Role Play",
    "サキュバス": "Role Play", "可愛いサンタ": "Role Play",
    "Maid": "Maid", "メイド": "Maid", "牛メイド": "Maid",

    # —— 身份 ——
    "Amateur": "Amateur", "Amateur Girls": "Amateur", "素人": "Amateur",
    "配信専用素人": "Amateur",
    "Slut": "Nympho", "Nymphomaniac": "Nympho", "Nympho": "Nympho", "Bitch": "Nympho",
    "痴女": "Nympho", "淫乱": "Nympho",
    "ハード系": "Nympho", "淫語": "Dirty talk", "Dirty Talk": "Dirty talk",
    "スケベな淫乱淑女": "Nympho", "淫乱・ハード系": "Nympho",
    "Extreme Ero Woman": "Nympho",
    "Married Woman": "Housewife", "Young Wife": "Housewife", "Housewife": "Housewife", "Wife": "Housewife",
    "人妻": "Housewife", "主婦": "Housewife", "奥様": "Housewife",
    "人妻・主婦": "Housewife", "若妻・幼妻": "Housewife", "若妻": "Housewife",
    "Mature Woman": "Mature / Milf", "Mature": "Mature / Milf", "MILF": "Mature / Milf", "Wives/Milf": "Mature / Milf",
    "熟女": "Mature / Milf", "熟女/人妻": "Mature / Milf",
    "Older Sister": "Mature Woman", "お姉さん": "Mature Woman",
    "Office Lady": "Secretary / OL", "Secretary": "Secretary / OL", "OL": "Secretary / OL", "秘書": "Secretary / OL",
    "School Girls": "Student", "Schoolgirl": "Student", "School Girl": "Student", "Student": "Student",
    "College Girl": "Student", "女子校生": "Student", "女学生": "Student", "学生": "Student",
    "ロリ": "Loli",
    "女子大生": "Student", "大学生": "Student", "JD": "Student",
    "Nurse": "Nurse", "ナース・看護婦": "Nurse", "看護婦・ナース": "Nurse",
    "看護婦": "Nurse", "看護師": "Nurse", "ナース": "Nurse",
    "Female Teacher": "Teacher", "Teacher": "Teacher", "女教師": "Teacher", "教師": "Teacher",
    # 「老师」在中文里同时盖住校内教师和上门家教，和上一行的「教师」分不开。
    "Private Tutor": "Private tutor", "家庭教師": "Private tutor",
    "Stewardess": "Flight attendant", "Flight Attendant": "Flight attendant", "スチュワーデス": "Flight attendant",
    "キャビンアテンダント": "Flight attendant",
    "Picking Up Girls": "Paid hookup", "Pick up": "Paid hookup", "Pickup": "Paid hookup", "ナンパ": "Paid hookup",
    "Gal": "Gyaru", "ギャル": "Gyaru", "黒ギャル": "Gyaru",
    "Princess & Mademoiselle": "Rich girl", "お嬢様・令嬢": "Rich girl", "お嬢様": "Rich girl",
    "Idol & Celebrity": "Idol", "Idol": "Idol", "アイドル・芸能人": "Idol",
    "アイドル": "Idol", "芸能人": "Idol",
    # 作品上的 `グラドル` 说的是出镜的是写真偶像；资料页上同一个词说她的行业，见 `PROFILE_GENRES`。
    "グラドル": "Idol",
    "Instructor": "Coach", "インストラクター": "Coach",
    # `三十路` 是 DMM 按年龄段分的格子，三十岁往上就是这个馆藏里说的熟女。
    "三十路": "Mature / Milf", "四十路": "Mature / Milf", "五十路": "Mature / Milf",
    # `童貞` 说男方第一次、`処女` 说女方第一次，来源两个格子分开写。英文 `Virgin`
    # 单说时讲的是女方，男方那一边站上一律写成 `Virgin Boy`。女方那一格是出道卖点或剧情，
    # 核实不了，所以叫「处女设定」。
    "童貞": "Male virgin", "Virgin Boy": "Male virgin", "Cherry Boy": "Male virgin",
    "処女": "Virgin theme", "Virgin": "Virgin theme", "Virgin Girl": "Virgin theme",
    "美熟女": "Elegant mature", "微熟女": "Soft mature", "美魔女": "Ageless beauty",
    "変態": "Pervert", "ニューハーフ": "Transgender", "Transsexual": "Transgender", "Shemale": "Transgender",
    "ギャル系": "Gyaru",
    "Pregnant": "Pregnant", "妊婦": "Pregnant", "妊婦・出産": "Pregnant",
    "Black Guy": "Interracial", "Black Man": "Interracial", "黒人": "Interracial", "黒人男優": "Interracial",
    # `女装・男の娘` 是男方扮成女生，身体没变，和 `ニューハーフ`（跨性别）分开。
    # r18 把 `ショタ` 打码写成 `S******n`（Shotacon），它和 `ロリ` 一样是剧情设定。
    "女装・男の娘": "Femboy", "Cross Dresser": "Femboy",
    "ショタ": "Shota", "S******n": "Shota",
    # 在日本片里出镜的欧美与亚洲其他国家女优都归「外国人」，和用户定下的 `外人` 同一格。
    "白人女優": "Foreigner", "Caucasian Actress": "Foreigner", "アジア女優": "Foreigner", "Asian Actress": "Foreigner",
    # DMM 写 `レースクィーン`，FC2 卖家写 `レースクイーン`，NFKC 不把小字 `ィ` 折成 `イ`。
    "レースクィーン": "Race queen", "レースクイーン": "Race queen", "Race Queen": "Race queen",
    "女捜査官": "Female detective", "Female Detective": "Female detective",
    # `コンパニオン` 是宴会上陪酒的女伴；`キャバ嬢・風俗嬢` 一个原文只投一个标签，取排在前面的陪酒女郎，
    # 单写的 `風俗嬢` 表达职业角色。
    "コンパニオン": "Hostess", "Hostess": "Hostess",
    "キャバ嬢・風俗嬢": "Hostess", "Club Hostess & Sex Worker": "Hostess",
    "風俗嬢": "Sex worker", "Prostitutes": "Sex worker",
    "キャリアウーマン": "Secretary / OL",
    "部活・マネージャー": "Student", "Club Manager": "Student",

    # —— 场景 ——
    "Outdoor": "Outdoor exhibitionism", "Outdoors": "Outdoor exhibitionism", "Exhibitionism": "Outdoor exhibitionism",
    "露出": "Outdoor exhibitionism", "野外・露出": "Outdoor exhibitionism", "野外露出": "Outdoor exhibitionism",
    "野外": "Outdoor", "屋外": "Outdoor", "海": "Outdoor",
    "Car Sex": "Car sex", "カーセックス": "Car sex", "車内": "In the car",
    "Massage": "Massage", "Massage Parlor": "Massage", "マッサージ": "Massage", "エステ": "Massage",
    "メンズエステ": "Massage", "メンエス": "Massage",
    # 涂油不一定在按摩店里：油光丝袜、涂油摔跤都是这个词，归进`按摩` 会把场景判错。
    "Oil": "Oil massage", "Lotion": "Oil massage", "オイル": "Oil massage", "ローション・オイル": "Oil massage",
    "ローション": "Oil massage",
    "Bath": "Bathroom", "Shower": "Bathroom", "Bathroom": "Bathroom", "Shower, Bathroom": "Bathroom",
    "風呂": "Bathroom", "お風呂": "Bathroom", "シャワー": "Bathroom", "入浴": "Bathroom",
    "School": "Classroom", "Classroom": "Classroom", "学園もの": "Classroom",
    "学校": "Classroom", "教室": "Classroom",
    "Hotel": "Hotel", "ホテル": "Hotel",
    "Office": "Office", "オフィス": "Office",
    # 风俗店比按摩店宽：泡泡浴、外送和店内接客都归这一格，来源也用一个 `風俗` 盖住。
    "風俗": "Fuzoku parlor", "ソープ": "Fuzoku parlor", "Soapland": "Fuzoku parlor",
    "デリヘル": "Fuzoku parlor", "性風俗": "Fuzoku parlor", "ヘルス・ソープ": "Fuzoku parlor",
    "Soapland Girl": "Fuzoku parlor",
    # `温泉` 说的是旅程和露天池，`浴室` 说的是家里那一间，两件事在检索上分得开。
    "Hot Spring": "Hot spring", "温泉": "Hot spring", "温泉・旅行": "Hot spring",
    "病院・クリニック": "Hospital", "Hospital/Clinic": "Hospital",
    "飲み会・合コン": "Party", "Drinking Party/Mixer": "Party",

    # —— 剧情 ——
    "Training": "Training", "BDSM": "Training", "Sadism": "Training", "Torture": "Training",
    "SM": "Training", "調教": "Training",
    "Slave": "Training", "Femsub": "Training", "Humiliation": "Training", "Spanking": "Training",
    "M女": "Training", "M-jo": "Training",
    "辱め": "Training", "Embarrassment": "Training", "鬼畜": "Training", "Hard Sex": "Training",
    # `羞恥` 是让她难为情的玩法，`辱め` 是折辱，前者没到调教那一步。
    "羞恥": "Humiliation", "Shame": "Humiliation",
    # `妄想族` 是时间停止、隐身一类现实里做不到的设定。
    "妄想族": "Fantasy storyline", "Daydreamers": "Fantasy storyline",
    "Bondage": "Bondage", "Ropes & Ties": "Bondage", "Restraint": "Bondage", "Shibari": "Bondage",
    "Tied Up": "Bondage",
    "拘束": "Bondage", "縛り": "Bondage", "緊縛": "Bondage", "縛り・緊縛": "Bondage", "Bind": "Bondage",
    "手枷": "Bondage", "首絞め": "Training", "ソフトSM": "Training",
    "Cheating Wife": "Cheating / Affair", "Cheating": "Cheating / Affair", "Adultery": "Cheating / Affair", "不倫": "Cheating / Affair",
    "浮気": "Cheating / Affair",
    "Cuckold": "NTR", "Netorare": "NTR", "NTR": "NTR",
    "寝取り": "NTR", "寝取られ": "NTR", "寝取り・寝取られ": "NTR",
    "寝取り・寝取られ・NTR": "NTR", "他人棒": "NTR",
    "Incest": "Incest", "近親相姦": "Incest", "近親": "Incest", "Stepfamily": "Incest",
    # 关系一格一个：`姉・妹` 是姐妹，`義母` 是继母，`女上司`／`部下・同僚` 是职场，`恋愛` 是恋人。
    "姉・妹": "Sister and brother", "Sister": "Sister and brother", "義母": "Mother and son", "Stepmom": "Mother and son",
    "女上司": "Coworker / Boss", "Female Boss": "Coworker / Boss", "部下・同僚": "Coworker / Boss", "Employee/Coworker": "Coworker / Boss",
    "恋愛": "Girlfriend", "Love": "Girlfriend", "幼なじみ": "Childhood friend", "Old Playmates": "Childhood friend",
    "Voyeur": "Voyeur", "Hidden Camera": "Voyeur", "盗撮・のぞき": "Voyeur",
    "Peeping": "Voyeur", "のぞき": "Voyeur", "盗撮": "Voyeur", "隠し撮り": "Voyeur",
    "Reluctant": "Forced storyline", "無理矢理": "Forced storyline", "レイプ": "Forced storyline",
    "監禁": "Forced storyline", "Confinement": "Forced storyline",
    "Drama": "Drama / Story", "ドラマ": "Drama / Story", "体験告白": "Drama / Story", "Confessional": "Drama / Story",
    "顔出し": "Face shown",
    "性教育": "Sex education", "Sex Education": "Sex education",
    "流出": "Leaked",
    # `痴女` 说的是女方的角色性格，`女性主导` 说的是这一场里谁支配谁；同一部片
    # 两个都挂得上，合成一个就再也问不出「找女方掌控的题材」。
    "Femdom": "Female domination", "Female Domination": "Female domination", "女王様": "Female domination",
    "M男": "Female domination", "Masochist Man": "Female domination", "Queen": "Female domination",
    "Panty Shot": "Accidental exposure", "パンチラ": "Accidental exposure",
    "初裏": "First uncensored",
    # `初撮り` 是素人系列里「这个人第一次上镜」，`デビュー作品`／`Debut` 是厂牌从
    # 自己这边说的同一件事。它描述的是作品在演员生涯里的位置，但馆藏已经把「第一次」
    # 当题材收（`初拍`、`初次无码`），两种写法就落在同一格。
    "初撮り": "Debut", "初撮り娘": "Debut", "デビュー作品": "Debut", "Debut": "Debut",
    "逆ナン": "Reverse pickup", "逆ナンパ": "Reverse pickup",
    # `痴漢` 是电车与人群里下手的那一类，和 `盗撮`（只看不碰）、`無理矢理`（明着来）
    # 各是一格，来源三个词都在用。
    "痴漢": "Molester", "Molester": "Molester", "Groping": "Molester", "チカン": "Molester",
    "イタズラ": "Molester", "Pranks": "Molester",
    "Sports": "Sports", "スポーツ": "Sports", "Athlete": "Sports", "アスリート": "Sports",
    "Drunk": "Drunk", "泥酔": "Drunk", "酔っ払い": "Drunk",
    # r18 的 `D***k Girl`（分类 4121）没给日文名，按打码字形读作 `Drunk Girl`。
    "D***k Girl": "Drunk",
    # `媚薬` 与 `ドラッグ` 在来源那边是两个格子，说的都是「靠药物起作用」这件事。
    "Aphrodisiac": "Drugs", "Drug": "Drugs", "ドラッグ": "Drugs", "媚薬": "Drugs", "Substance Use": "Drugs",
    "Documentary": "Documentary", "ドキュメンタリー": "Documentary",
    # `イメージビデオ`／`グラビア` 是不露骨的写真映像，和 `剧情` 不是一回事。
    "Image Video": "Gravure video", "イメージビデオ": "Gravure video", "グラビア": "Gravure video",
    "着エロ": "Gravure video", "Non-nude Erotica": "Gravure video",

    # —— 技术属性 ——
    "Digital Mosaic": "Censored", "Minimal Mosaic": "Censored", "Censored": "Censored", "デジモ": "Censored",
    "ギリモザ": "Thin mosaic",
    "無修正": "Uncensored", "Uncensored": "Uncensored",
    # FC2 标题开头的 `【無】`、`【モ無し】` 是無修正的省写，卖家原样搬进标签。
    "無": "Uncensored", "モ無し": "Uncensored",
    "ASMR": "ASMR", "音声": "ASMR", "音声作品": "ASMR",
    "4K": "4K",
    "Virtual Reality": "VR", "VR": "VR", "VR Exclusive": "VR", "High-Quality VR": "VR",
    "8KVR": "VR", "VR専用": "VR",
    "Compilation": "Collection", "Omnibus": "Collection", "Actress Best Compilation": "Collection",
    "女優ベスト・総集編": "Collection", "総集編": "Collection", "ベスト・総集編": "Collection",
    # JavDB 中文类别原词。复合的「肛門・肛交」不区分行为，只投到肛门这一层。
    "肛門・肛交": "Butthole", "高跟鞋": "High Heels", "絲襪": "Stockings", "過膝襪": "Stockings",
    "絲襪、過膝襪": "Stockings", "白天出軌": "Cheating / Affair", "白天出轨": "Cheating / Affair", "出軌": "Cheating / Affair",
    "潮吹": "Squirting", "大屁股": "Big ass", "蕩婦": "Nympho", "荡妇": "Nympho", "第一人稱攝影": "POV",
    "多P": "Group", "濫交": "Group", "護士": "Nurse", "紀錄片": "Documentary",
    "角色扮演": "Role Play", "角色扮演者": "Role Play", "姐姐": "Mature Woman",
    "精選綜合": "Collection", "流汗": "Sweaty", "美容院": "Massage",
    "美臀": "Nice butt", "女大學生": "Student",
    "女上位": "Riding", "乳交": "Titfuck", "乳液": "Oil massage", "首次亮相": "Debut",
    "素人作品": "Amateur", "玩具": "Sex Toys", "無毛": "Shaved", "學校作品": "Classroom",
    "顏射": "Facial", "藥物": "Drugs", "業餘": "Amateur", "已婚婦女": "Housewife", "自慰": "Masturbation",
    # 已取得的 JavDB 中文原词，逐项对齐既有日英条目和规范名；不做通用简繁转换。
    # 剧情和角色用语按作品设定投影，女同性恋与女同接吻同属既有 Lesbian / レズキス。
    "強姦": "Forced storyline", "亂倫": "Incest", "偷窺": "Voyeur",
    "女同性戀": "Yuri / GL", "女同接吻": "Yuri / GL", "爛醉如泥的": "Drunk",
    "處女": "Virgin theme", "處男": "Male virgin", "運動": "Sports",
    "奴隸": "Training", "性奴": "Training", "凌辱": "Training", "打屁股": "Training",
    "捆綁": "Bondage", "束縛": "Bondage", "龜甲捆綁": "Bondage",
    "輪姦": "Group", "電車痴漢": "Molester", "女王": "Female domination",
    "高中女生": "Student", "女學生": "Student", "其他學生": "Student",
    "藝人": "Idol", "偶像": "Idol", "辣妹": "Gyaru",
    "大小姐": "Rich girl", "賽車女郎": "Race queen", "家教": "Private tutor",
    "黑人演員": "Interracial", "童年朋友": "Childhood friend",
    "孕婦": "Pregnant", "妊娠": "Pregnant", "太太": "Housewife", "幼妻": "Housewife",
    "變性者": "Transgender", "變性人": "Transgender",
    # 尺寸、外观和服装只保留来源已说到的范围。靴子不等于高跟，湿身不等于汗湿。
    "刺青紋身": "Tattoo", "明星臉": "Celebrity lookalike", "蘿莉塔": "Lolita", "蘿莉": "Loli",
    "巨大陰莖": "Large Cock", "巨大阴茎": "Large Cock", "平胸": "Small breasts", "超乳": "Big Breasts", "巨乳爆乳": "Big Breasts",
    "高挑": "Tall", "高挑身材": "Tall", "美腳": "Beautiful legs", "多毛": "Hairy",
    "漂亮屁股": "Nice butt", "眼鏡娘": "Glasses", "美穴": "Pretty pussy", "白虎": "Shaved",
    "混血美女": "Mixed race", "短髮": "Short hair", "肉肉女": "Plump", "金發": "Blonde",
    "雪白皮膚": "Fair skin", "內衣": "Erotic lingerie", "水手服": "Uniform", "校服": "Uniform",
    "製服": "Uniform", "女子高生製服": "Uniform", "泳裝": "Swimsuit", "學校泳裝": "Swimsuit",
    "比基尼": "Swimsuit", "連褲襪": "Stockings", "漁網褲襪": "Stockings", "迷你裙": "Miniskirt",
    "女傭": "Maid", "空中小姐": "Flight attendant", "空姐": "Flight attendant", "旗袍": "Cheongsam / Hanfu",
    "兔女郎": "Bunny girl", "婚紗禮服": "Wedding dress", "和服": "Kimono / Yukata",
    "COSPLAY服飾": "Role Play", "體育Cosplay": "Role Play",
    # 行为和场景沿用已有 Fingering、Masturbation、Gangbang 等条目的去向。
    "舔陰": "Cunnilingus", "手指插入": "Handjob", "手淫": "Masturbation", "淫蕩手淫": "Masturbation",
    "打手槍": "Masturbation", "深喉": "Deep throat", "足交": "Footjob", "吞精": "Swallowing",
    "拳交": "Fisting", "排便": "Scat", "食糞": "Scat", "灌腸": "Scat", "糞便": "Scat",
    "二穴同入": "Double penetration", "二穴同插": "Double penetration",
    "兩女一男": "Group", "兩男一女": "Group", "兩男兩女": "Group",
    "後入": "Doggy style", "背後插入": "Doggy style", "站立後入": "Doggy style", "肛交": "Anal",
    "無套內射": "Creampie", "立即口交": "Oral", "左右口交": "Oral", "口爆": "Cum in mouth",
    "騎乘位": "Riding", "背部騎乘位": "Riding", "立即騎乘": "Riding", "顏面騎乘": "Face sitting",
    "第一人稱視角(POV)": "POV", "尿失禁": "Pissing",
    "跳蛋": "Sex Toys", "按摩棒": "Sex Toys", "女優按摩棒": "Sex Toys",
    "插入異物": "Sex Toys", "假陽具": "Sex Toys",
    "溫泉": "Hot spring", "洗澡": "Bathroom", "淋浴沐浴": "Bathroom", "戶外": "Outdoor",
    "汽車性愛": "Car sex", "按摩": "Massage", "搭訕": "Paid hookup",
    "戀愛": "Girlfriend", "戲劇": "Drama / Story", "戏剧": "Drama / Story", "寫真": "Gravure video", "局部特寫": "Close-up",
    "薄馬賽克": "Thin mosaic", "數位馬賽克": "Censored",
    # 用户确认的译名；JavDB 中英文类别用同一链接核对身份。
    "妓女": "Sex worker", "雙性人": "Futa", "Futanari": "Futa", "ふたなり": "Futa",
    "戀腿癖": "Leg fetish", "恋腿癖": "Leg fetish", "Leg Fetish": "Leg fetish", "戀乳癖": "Breast fetish", "Busty Fetish": "Breast fetish",
    "Female Investigator": "Female detective",
    "蠻橫嬌羞": "Tsundere", "Tsundere": "Tsundere", "ツンデレ": "Tsundere",
    "瘦小身型": "Petite", "子宮頸": "Cervix", "Cervix": "Cervix",
    # 职业、角色与关系分别投影，不从单个角色推断近亲关系。
    "母親": "Mother role", "妹妹": "Little sister role", "寡婦": "Widow",
    "女醫生": "Female doctor", "模特兒": "Model", "格鬥家": "Fighter",
    "展場女孩": "Convention girl", "講師": "Lecturer", "服務生": "Waitress",
    "車掌小姐": "Train attendant", "女兒": "Daughter role", "公主": "Princess role",
    "御宅族": "Otaku couple", "老太婆": "Older woman role", "老年男性": "Older man role",
    "拉拉隊": "Cheerleader", "養女": "Adopted daughter role", "女戰士": "Female warrior",
    "女忍者": "Female ninja", "迷你裙警察": "Skirted policewoman", "修女": "Nun",
    "播音員": "Announcer", "白人": "White performer",
    "情侶": "Couple", "友誼": "Friendship", "伴侶": "Partner", "媽媽的朋友": "Mother's friend",
    # 服装与身体状态保持来源的具体粒度。
    "曬黑": "Tanned skin", "純欲": "Sweet and sexy", "濕身": "Soaked", "濕透": "Soaked",
    "運動短褲": "Sport shorts", "制服外套": "Uniform jacket", "裸體圍裙": "Naked apron",
    "貓耳女": "Cat ears", "短裙": "Short skirt", "緊身衣": "Bodysuit", "泡泡襪": "Loose socks",
    "靴子": "Boots", "胖女人": "Heavyset", "肌肉": "Muscular",
    "不穿內褲": "No panties", "不穿胸罩": "No bra", "白眼失神": "Eye-rolling blackout",
    "蒙面・面罩": "Hooded", "捲髮": "Curly hair", "運動裝": "Tracksuit",
    # 题材与行为不以相邻标签代替。
    "正太控": "Shotacon", "跳舞": "Dance", "獵豔": "Pickup", "惡作劇": "Prank",
    "性騷擾": "Molestation storyline", "殘忍畫面": "Brutal depiction", "觸手": "Tentacles",
    "性轉換·女體化": "Gender swap", "男同性戀": "Gay male", "經歷告白": "Personal story",
    "蘿莉角色扮演": "Loli roleplay", "約會": "Date", "瑜伽·健身": "Yoga and fitness",
    "催眠": "Hypnosis storyline", "夫妻交換": "Swinging", "綜藝": "Variety show",
    "歷史劇": "Period drama", "恐怖": "Horror storyline", "科幻": "Sci-fi storyline",
    "滑稽模仿": "Parody", "惡搞": "Parody", "冒險": "Adventure storyline", "懸疑": "Mystery storyline",
    "心理驚悚": "Psychological thriller", "復古": "Retro", "懷舊": "Vintage style",
    "絕頂高潮": "Orgasm", "飲尿": "Piss drinking", "搔癢": "Tickling", "脫衣": "Striptease",
    "導尿": "Catheterization", "口球": "Ball gag", "輔助自慰": "Masturbation aid", "鼻鉤": "Nose hook",
    "1v1性交": "One-on-one", "M字開腿": "M-legs", "站立性交": "Standing sex", "浪叫": "Moaning",
    "公共場所": "Public place", "南國度假地": "Tropical resort", "旅行": "Travel",
    "給女性觀眾": "For women", "原作改編": "Original-work adaptation",
}

#: 女优资料页（minnano-av）标签的专用去向，查表排在 `CONTENT_GENRES` 前面。
#:
#: 同一个词在作品上和资料上说的不是一件事：作品上的 `風俗嬢` 是角色「风俗女郎」、`看護師`
#: 是角色扮演「护士」，资料上说的是她本人做过的行业，所以行业词只进这张表。
#: 资料上还有几样作品上没有的写法：一格写了几个标签的（值是几个）、带箭头说她风格
#: 前后变了的（整条保留）、厂牌与改名移籍这些经历（空元组，不作为标签）。
PROFILE_GENRES: dict[str, tuple[str, ...]] = {
    # —— 风俗，一种一个 ——
    **dict.fromkeys(("デリヘル嬢", "現役デリヘル嬢", "現役デリ嬢", "元・デリヘル嬢"), ("Escort",)),
    **dict.fromkeys(("ソープ嬢", "現役ソープ嬢"), ("Soap girl",)),
    "セクシーパブ嬢": ("Sexy pub hostess",),
    # 站上只说做过风俗，没说哪一种。
    **dict.fromkeys(("風俗嬢", "風俗歴有り"), ("Sex industry work",)),
    # —— 其余行业，各译各的；「元」「現役」只说时间，行业是同一个 ——
    **dict.fromkeys(("キャバクラ嬢", "現役キャバ嬢", "現役キャバ嬢(六本木・RedDragon)"), ("Hostess",)),
    "現役ホステス.": ("Hostess",),
    # `踊り子` 在日本就指脱衣舞台上的舞者。
    **dict.fromkeys(("ストリッパー", "現役ストリッパー", "踊り子", "ストリップデビュー予定"), ("Stripper",)),
    "撮影会ヌードモデル": ("Nude model",), "SMモデル": ("SM model",), "コスプレイヤー": ("Coser",),
    **dict.fromkeys(("グラドル", "元グラドル", "グラビアアイドル"), ("Gravure idol",)),
    "元アイドル": ("Idol",), "タレント": ("TV personality",), "元レースクイーン": ("Race queen",),
    "シンガー": ("Singer",), "YouTuber": ("YouTuber",), "映画出演": ("Film actress",),
    "ピンク映画女優": ("Pink film actress",), "監督": ("Director",), "元アスリート(新体操)": ("Athlete",),
    # 作品上的「护士」是角色扮演，这里是本职。
    "現役看護師": ("Active nurse",),
    "SOD女子社員新卒採用内定者": ("SOD staff",), "金券業者": ("Ticket reseller",), "蟹漁師": ("Crab fisherman",),
    # —— 出身、经历与特长 ——
    "クォーター": ("Quarter heritage",), "アメリカ系": ("American heritage",), "韓国系": ("Korean heritage",),
    "台湾系": ("Taiwanese heritage",), "タイ系": ("Thai heritage",), "イタリア系": ("Italian heritage",),
    "カナダ系": ("Canadian heritage",), "スペイン系": ("Spanish heritage",),
    "整形": ("Plastic surgery",), "顔整形": ("Plastic surgery",), "口元にホクロ": ("Mole by the mouth",), "美爪": ("Manicure",),
    "NGナシ": ("No NG",), "新体操": ("Rhythmic gymnastics",), "バレエ": ("Ballet",),
    # 说的是出道作的卖点，不是她现在的状态，不并进「处女设定」。
    "処女デビュー": ("Virgin debut",),
    # 着衣的色情影像，AV 之前的出身。
    "着エロ": ("Clothed erotica",),
    ".美人": ("Gorgeous",), "清楚お嬢様系": ("Innocent", "Rich girl"),
    **dict.fromkeys(("豊胸乳(89F)", "豊胸後(響つかさ)", "豊胸後(あきばもも)", "豊胸後改名"), ("Breast implants",)),
    "全身タトゥー(改名後)": ("Tattoo",),
    **dict.fromkeys(("中出しOK",), ("Creampie",)), "無修正作品あり": ("Uncensored",),
    **dict.fromkeys(("東熱大乱交", "東熱大乱交(便器女)"), ("Group",)),
    # —— 风格转变：箭头两边都留 ——
    "ロング→ショートカット": ("Long hair→Short hair",), "ロリ→ギャル": ("Lolita→Gyaru",),
    "ロリ→黒ギャル": ("Lolita→Black gyaru",), "ロリ→熟女": ("Lolita→Mature",), "ロリ系→熟女": ("Lolita→Mature",),
    "美少女→熟女(ムッチリ)": ("Beauty→Voluptuous milf",), "微乳→巨乳": ("Petite→Busty",),
    "微乳→偽乳(豊胸乳)": ("Petite→Breast implants",),
    # —— 站上把几个标签写进了一格 ——
    "ショートカット、美乳、レズ": ("Short hair", "Beautiful Breasts", "Yuri / GL"), "美乳美尻": ("Beautiful Breasts", "Nice butt"),
    "巨尻ごっくん": ("Big ass", "Swallowing"), "無修正生中出し": ("Uncensored", "Creampie"),
    "無修正流出": ("Uncensored", "Leaked"), "偽乳(豊胸乳)エロ乳首": ("Breast implants", "Erotic nipples"),
    "美巨乳(豊胸乳)": ("Big Breasts", "Breast implants"),
    # 「最強ボディ」是夸法，不单独成标签。
    "最強ボディ巨乳": ("Big Breasts",), "最強ボディエロ乳首": ("Erotic nipples",),
    # —— 不作为标签 ——
    # 厂牌、站点与系列：去向是作品的厂牌，不是她的标签。
    **dict.fromkeys((
        "FC2", "カリビアン", "カリビアンコム", "東京熱", "一本道", "heyzo", "Hey動画", "天然むすめ",
        "パコパコママ", "ガチん娘", "CovertJapan", "エッチな4610", "エッチな0930", "GirlsDelta",
        "ガールズデルタ", "tenshigao", "しろハメ", "麻豆传媒", "S1", "人妻斬り",
        "撮りおろし徹底屈辱ビデオ", "問答無用姦", "鬼逝", "餌食牝", "一刀両断", "1000人斬り",
        "太平洋娘", "洋物", "単体"), ()),
    # 引退、复出与改名移籍：生涯那一格已经说了还拍不拍；这里的箭头说的是经历先后，不是风格。
    **dict.fromkeys((
        "引退", "AV女優引退", "AV引退", "2008年引退", "2012年復帰", "復活", "故人", "伝説", "名女優",
        "極稀にAV女優", "改名・移籍", "改名・再移籍", "改名", "移籍", "移籍(改名なし)", "移籍→改名",
        "引退→復活(改名・移籍)", "改名・移籍→改名(移籍なし)", "改名・移籍→再改名・再移籍",
        "改名(移籍なし)→再改名・移籍", "移籍(MarksGroup→LINX)→改名・移籍", "改名(移籍なし)→改名・移籍",
        "引退→復活→引退→再復活", "引退→復活・移籍(改名なし)", "身バレ"), ()),
    # 所属团体、夸法、学历出身、数值与编者注记、政治立场：都不说内容。
    **dict.fromkeys((
        "恵比寿マスカッツ", "S3チーム「cuteen」メンバー", "”millionガールズZ”", "鈴木心4姉妹",
        "美体", "パーフェクトボディ", "パーフェクトボディー", "スーパーボディ", "最強ボディ",
        "絶叫", "可愛い笑顔", "可愛いしぐさ", "中卒", "帰国子女", "スイス出身→ロシア出身", "ロス出身",
        ".", "H93？", "48kg", "44.4kg", "推定体重40kg未満", "E70", "ブラサイズH65",
        "「瑞樹ララ」は別人", "「天然むすめ」の「南ゆき」は別人", "中山こころ", "妊娠線(葵百合香)",
        "乳論", "親中", "反日", "親韓"), ()),
}

#: 来源确实返回、但描述的不是内容的 genre。画质、载体、发行方式、促销企划和
#: 「单体作品／AV女優」这类演员编成都归这里：排除是判断，不是遗漏。
NON_CONTENT_GENRES: frozenset[str] = frozenset({
    # 画质与载体
    "Hi-Def", "HD High Definition", "FULL HD 1080P", "iPhone/iPad Movie",
    "Streaming Video", "ハイビジョン", "フルハイビジョン(FHD)", "高画質",
    "Blu-ray（ブルーレイ）", "DVD", "スマホ対応", "4K撮影",
    # 发行与促销
    "Exclusive Distribution", "独占配信", "Original Collaboration",
    "BIG Sale", "BIG Sale Part 2", "Sale (limited time)",
    "Prestige 40% Off Sale", "MOODYZ Campaign", "StaffPicks06",
    "Outlet (store That Sells Seconds, Discontinued Lines, Etc.)",
    "期間限定セール", "セール", "MGS限定特典映像", "特典映像あり",
    "配信専用", "MGSだけのおまけ映像付き", "Top Selling",
    "オリジナル動画", "超VIP", "1080p", "720p", "480p", "60fps",
    "Series", "Independent", "AV Open 2014 Heavyweight",
    # 样片与附属物料
    "店長推薦作品",
    "Sample Video", "Sample Movie", "Photo Gallery", "サンプル動画",
    "写真集", "Editor's Choice", "Recommended", "本編なし",
    # 演员编成与片长。`Famous Name` 是 aventertainments 给知名女优开的格子，
    # 说的是演员的名气，和 `Featured Actress` 同一条线。
    "Featured Actress", "Female Porn Star", "Famous Name", "AV女優", "単体作品", "單體作品", "单体作品",
    # `Variety` 是 `企画` 的英文：新抓的 genre 取日文原词，旧队列里冻着的那些还是英文。
    "企画", "Variety", "Over 4 Hours", "4時間以上作品", "16時間以上作品", "超有名S級女優",
    "4小時以上作品", "16小時以上作品", "各種職業",
    # `おっぱい` 单写只说「有胸」，说不出大小和形状，投哪个乳型都是猜。
    "おっぱい",
    "Gril on top 2", "All Sex",
    # 同人载体
    "同人ソフト オリジナル",
    # K-MIB 的氛围词与厂牌名：几乎每部都挂，区分不了内容
    "Sexy", "Glamour", "Model", "Couple", "Romantic", "Caress", "Orgasm",
    "JSmedia",
    # aventertainments 的氛围词：说的是激烈程度和叫声，不是某种行为或题材
    "Hardcore Fuck", "Scream for Joy",
    # 来源自己的兜底格：它说的是「归不进上面任何一格」，不是某种内容
    "Fetish", "フェチ", "その他フェチ", "Other Fetishes",
    "Various Professions", "Various Worker", "職業色々", "その他", "Others",
    # 比现有词表细一档的服装、职业与日常场景：单独立一个标签只能压住一两部片，
    # 筛选面板上多一行、检索上什么也分不开
    "Jeans", "ジーンズ", "Shorts", "短パン", "Choker", "Kawaii Fashion",
    "Store Clerk", "店員", "Shopping", "買い物",
    "カラコン", "ブリーフ", "縞しま", "ボディコン", "Tight Dress", "ロングヘアー", "股間に穴", "全裸", "ヌード",
    "着衣", "完全着衣", "着衣のSEX", "ゴム", "Wピース", "ピース", "着替え", "サランラップ",
    "トイレ", "ベッド", "試着室", "プリクラ", "引っ越し", "新居", "クリスマス",
    # FC2 卖家自填的发行说法：谁拍的、公开过没有、卖几份、片子多长，和 `Independent`、
    # `独占配信`、`4時間以上作品` 同一条线。`0930` 是厂牌 `エッチな0930` 的简写。
    "個人撮影", "個撮", "オリジナル", "未公開", "限定", "独占", "VIP", "無編集", "長編",
    "JAPANESE", "0930", "むすめガチャ", "有名人", "女優", "モデル",
    # 泛指做爱本身，和 `All Sex` 一样每部都挂得上。
    "セックス", "SEX", "性交", "エッチ", "ハメ", "2回戦",
    # 夸法、氛围与高潮的说法，和 `Sexy`、`Orgasm` 同档；最后几个是从标题截下来的剧情短语。
    "セクシー", "極上", "凄い", "気持ちいい", "超気持ちいい", "えろい", "エロ過ぎ", "ドスケベ",
    "恥ずかしい", "おしゃれ", "従順", "ご奉仕", "ご奉仕プレイ", "イキまくり", "子宮イキ", "腹イキ",
    "コンビネーション", "グリグリ", "テカテカ", "指一本", "擬似", "勝負", "我慢できない",
    "極楽天国", "征服感満載", "聖夜に一発", "早漏改善", "チンポ検査",
    # 人名、昵称与作品名说的是谁、扮谁；扮演这件事由 `コスプレ` 那一格说。
    "しょうなちゃん", "あいちゃん", "猫ちゃん", "KOF", "不〇火舞", "テ〇ファ", "FG○",
    # JavDB 的发行、来源、营销与兜底类别保留在来源快照，不断言本地文件属性。
    "企畫", "韓國", "亞洲", "亞洲女演員", "經典", "感謝祭", "無碼流出", "無碼破解",
    "國外進口", "成人電影", "介紹影片", "投稿", "獨立製作", "重印版", "西洋片",
    "愛好，文化", "R-15", "HDTV", "共演", "奧斯曼株式會社", "女主角", "人氣標題",
    "店長推薦", "知名女優", "最新影片", "獨占影片", "精品收藏", "DVD已售罄",
    "週排名第一的作品", "2018暢銷Top100", "其他戀物癖", "OK", "其他",
})


#: 促销企划的名字是逐片起的——「プレステージ20周年特別企画」「春のBIGセール」
#: 「プレステージグループ秋の企画祭り」——穷举一轮就过期一轮。这几个词根本身
#: 就说明了它描述的是卖法而不是内容，按形状判非内容比逐条登记稳。
NON_CONTENT_PATTERNS = (
    re.compile(r"セール"),
    re.compile(r"キャンペーン"),
    re.compile(r"企画祭り"),
    re.compile(r"特別企画"),
    re.compile(r"(?i)\bbig sale\b"),
    re.compile(r"(?i)campaign"),
)


def normalise_genre(raw: object) -> str:
    """统一全半角、空白与英文大小写，让一个来源写法只对应一个键。"""
    text = unicodedata.normalize("NFKC", str(raw or ""))
    return " ".join(text.split()).casefold()


# BEGIN GENERATED_SIMPLIFIED_GENRES
CONTENT_ALIASES = {
    "cosplay服饰": "Role Play",
    "m字开腿": "M-legs",
    "w奸": "Group",
    "不伦": "Cheating / Affair",
    "不穿内裤": "No panties",
    "业余": "Amateur",
    "丝袜": "Stockings",
    "丝袜、过膝袜": "Stockings",
    "两女一男": "Group",
    "两男一女": "Group",
    "两男两女": "Group",
    "主妇": "Housewife",
    "主观视角": "POV",
    "义母": "Mother and son",
    "乱伦": "Incest",
    "伪乳": "Breast implants",
    "伪乳(豊胸乳)": "Breast implants",
    "伴侣": "Partner",
    "低身长": "Petite",
    "体育cosplay": "Role Play",
    "假阳具": "Sex Toys",
    "偷窥": "Voyeur",
    "公共场所": "Public place",
    "其他学生": "Student",
    "养女": "Adopted daughter role",
    "内衣": "Erotic lingerie",
    "冒险": "Adventure storyline",
    "写真": "Gravure video",
    "出轨": "Cheating / Affair",
    "刚毛": "Hairy",
    "初里": "First uncensored",
    "制服": "Uniform",
    "刺青纹身": "Tattoo",
    "南国度假地": "Tropical resort",
    "卷发": "Curly hair",
    "历史剧": "Period drama",
    "原作改编": "Original-work adaptation",
    "友谊": "Friendship",
    "双性人": "Futa",
    "变性人": "Transgender",
    "变性者": "Transgender",
    "后入": "Doggy style",
    "后背位": "Doggy style",
    "处女": "Virgin theme",
    "处男": "Male virgin",
    "変态": "Pervert",
    "复古": "Retro",
    "大喷射": "Ejaculation",
    "大量颜射": "Facial",
    "天然阴毛": "Hairy",
    "夫妻交换": "Swinging",
    "女优按摩棒": "Sex Toys",
    "女佣": "Maid",
    "女儿": "Daughter role",
    "女医生": "Female doctor",
    "女同性恋": "Yuri / GL",
    "女大学生": "Student",
    "女子高生制服": "Uniform",
    "女学生": "Student",
    "女战士": "Female warrior",
    "女捜查官": "Female detective",
    "女教师": "Teacher",
    "奴隶": "Training",
    "妈妈的朋友": "Mother's friend",
    "妊妇": "Pregnant",
    "婚纱礼服": "Wedding dress",
    "子宫颈": "Cervix",
    "孕妇": "Pregnant",
    "学校作品": "Classroom",
    "学校泳装": "Swimsuit",
    "家庭教师": "Private tutor",
    "寡妇": "Widow",
    "导尿": "Catheterization",
    "局部特写": "Close-up",
    "展场女孩": "Convention girl",
    "巨乳轮": "Large areola",
    "巨大乳轮": "Large areola",
    "巨大阴茎": "Large Cock",
    "已婚妇女": "Housewife",
    "异物挿入": "Sex Toys",
    "强奸": "Forced storyline",
    "心理惊悚": "Psychological thriller",
    "怀旧": "Vintage style",
    "性转换·女体化": "Gender swap",
    "性风俗": "Fuzoku parlor",
    "性骚扰": "Molestation storyline",
    "恋乳癖": "Breast fetish",
    "恋爱": "Girlfriend",
    "恋腿癖": "Leg fetish",
    "恶作剧": "Prank",
    "恶搞": "Parody",
    "悬疑": "Mystery storyline",
    "情侣": "Couple",
    "戏剧": "Drama / Story",
    "户外": "Outdoor",
    "打手枪": "Masturbation",
    "扫除": "Cleanup blowjob",
    "护士": "Nurse",
    "拉拉队": "Cheerleader",
    "捆绑": "Bondage",
    "插入异物": "Sex Toys",
    "搔痒": "Tickling",
    "搭讪": "Paid hookup",
    "播音员": "Announcer",
    "教师": "Teacher",
    "数位马赛克": "Censored",
    "无": "Uncensored",
    "无修正": "Uncensored",
    "无套内射": "Creampie",
    "无毛": "Shaved",
    "无理矢理": "Forced storyline",
    "明星脸": "Celebrity lookalike",
    "晒黑": "Tanned skin",
    "服务生": "Waitress",
    "束缚": "Bondage",
    "格斗家": "Fighter",
    "模特儿": "Model",
    "残忍画面": "Brutal depiction",
    "母亲": "Mother role",
    "汽车性爱": "Car sex",
    "泡泡袜": "Loose socks",
    "泳装": "Swimsuit",
    "浣肠": "Scat",
    "淫荡手淫": "Masturbation",
    "淫语": "Dirty talk",
    "清纯": "Innocent",
    "清纯系": "Innocent",
    "渔网裤袜": "Stockings",
    "温泉": "Hot spring",
    "湿身": "Soaked",
    "湿透": "Soaked",
    "滥交": "Group",
    "灌肠": "Scat",
    "烂醉如泥的": "Drunk",
    "猎艳": "Pickup",
    "猫耳女": "Cat ears",
    "生奸": "Creampie",
    "电车痴汉": "Molester",
    "男同性恋": "Gay male",
    "痴汉": "Molester",
    "白人女优": "Foreigner",
    "白天出轨": "Cheating / Affair",
    "监禁": "Forced storyline",
    "看护妇": "Nurse",
    "看护师": "Nurse",
    "眼镜": "Glasses",
    "眼镜娘": "Glasses",
    "短发": "Short hair",
    "秘书": "Secretary / OL",
    "立即骑乘": "Riding",
    "站立后入": "Doggy style",
    "竞泳水着": "Swimsuit",
    "童贞": "Male virgin",
    "第一人称摄影": "POV",
    "第一人称视角(pov)": "POV",
    "粪便": "Scat",
    "精选综合": "Collection",
    "精饮": "Swallowing",
    "紧缚": "Bondage",
    "紧身衣": "Bodysuit",
    "総集编": "Collection",
    "约会": "Date",
    "纪录片": "Documentary",
    "纯欲": "Sweet and sexy",
    "细身": "Slim",
    "经历告白": "Personal story",
    "给女性观众": "For women",
    "绝顶高潮": "Orgasm",
    "综艺": "Variety show",
    "美乳轮": "Pretty areola",
    "美人名女优": "Gorgeous",
    "美人轮": "Pretty areola",
    "美脚": "Beautiful legs",
    "美贫乳": "Small breasts",
    "美颜": "Gorgeous",
    "羞耻": "Humiliation",
    "背后插入": "Doggy style",
    "背部骑乘位": "Riding",
    "脱衣": "Striptease",
    "舔阴": "Cunnilingus",
    "艺人": "Idol",
    "苗条": "Slim",
    "荡妇": "Nympho",
    "药物": "Drugs",
    "萝莉": "Loli",
    "萝莉塔": "Lolita",
    "萝莉角色扮演": "Loli roleplay",
    "薄马赛克": "Thin mosaic",
    "蛮横娇羞": "Tsundere",
    "裸体围裙": "Naked apron",
    "触手": "Tentacles",
    "讲师": "Lecturer",
    "调教": "Training",
    "贫乳": "Small breasts",
    "赛车女郎": "Race queen",
    "足里": "Foot fetish",
    "车内": "In the car",
    "车掌小姐": "Train attendant",
    "轮奸": "Group",
    "软体": "Flexible",
    "辅助自慰": "Masturbation aid",
    "过膝袜": "Stockings",
    "运动": "Sports",
    "运动短裤": "Sport shorts",
    "运动装": "Tracksuit",
    "近亲": "Incest",
    "近亲相奸": "Incest",
    "连裤袜": "Stockings",
    "里筋": "Oral",
    "金发": "Blonde",
    "长乳首": "Long nipples",
    "长身": "Tall",
    "雪白皮肤": "Fair skin",
    "颜射": "Facial",
    "颜面骑乗": "Face sitting",
    "颜面骑乘": "Face sitting",
    "风俗": "Fuzoku parlor",
    "风俗嬢": "Sex worker",
    "风吕": "Bathroom",
    "食粪": "Scat",
    "饮尿": "Piss drinking",
    "饮精": "Swallowing",
    "骑乗位": "Riding",
    "骑乘位": "Riding",
    "高身长": "Tall",
    "高速骑乗位": "Riding",
    "黑人演员": "Interracial",
    "黒人男优": "Interracial",
    "鼻钩": "Nose hook",
    "龟甲捆绑": "Bondage"
}
EXCLUDED_ALIASES = frozenset([
    "16小时以上作品",
    "16时间以上作品",
    "2018畅销top100",
    "4小时以上作品",
    "4时间以上作品",
    "av女优",
    "个人撮影",
    "个撮",
    "亚洲",
    "亚洲女演员",
    "人气标题",
    "介绍影片",
    "企画",
    "其他恋物癖",
    "单体作品",
    "各种职业",
    "周排名第一的作品",
    "国外进口",
    "奥斯曼株式会社",
    "JAV",
    "店员",
    "店长推荐",
    "店长推荐作品",
    "征服感満载",
    "従顺",
    "感谢祭",
    "成人电影",
    "拟似",
    "无码流出",
    "无码破解",
    "无编集",
    "未公开",
    "极上",
    "极楽天国",
    "爱好,文化",
    "独占影片",
    "独立制作",
    "知名女优",
    "经典",
    "职业色々",
    "胜负",
    "试着室",
    "超有名s级女优",
    "长编",
    "韩国",
    "高画质"
])
# END GENERATED_SIMPLIFIED_GENRES

_CONTENT_INDEX = {**CONTENT_ALIASES, **{normalise_genre(key): value for key, value in CONTENT_GENRES.items()}}
_CONTENT_INDEX.update({normalise_genre(value): value for value in CONTENT_GENRES.values()
                       if normalise_genre(value) not in _CONTENT_INDEX})
_NON_CONTENT_INDEX = frozenset(normalise_genre(value) for value in NON_CONTENT_GENRES) | EXCLUDED_ALIASES


def is_non_content_genre(raw: object) -> bool:
    key = normalise_genre(raw)
    if key in _NON_CONTENT_INDEX:
        return True
    return any(pattern.search(key) for pattern in NON_CONTENT_PATTERNS)


#: `resolve_genre` 判「未收录」时的返回值。用空串而不是另起一个哨兵类型：调用方本来
#: 就要区分「有标签」和「没有标签」，多一种对象只会让每个调用点多写一次 import。
UNMAPPED = ""


def resolve_genre(raw: object,
                  decisions: Mapping[str, str | None] | None = None) -> str | None:
    """一个来源原文的去向：Peach 标签、`None`（非内容，明确排除）、或 `UNMAPPED`。

    查表顺序是用户决定、非内容、内容表。`decisions` 是用户在复核页当场定下的那批，
    键已规范化。它排在两张静态表前面：用户刚说过的话不该被发版时写下的默认盖掉，
    而把同一个词收录成别的标签正是他改主意的方式。

    抓取与复核折叠候选走同一个函数。各写一份的代价是「表里补了这个词，页面上它仍然
    停在未收录」：候选文件是抓取那一刻的产物，表却是后来才补齐的。
    """
    key = normalise_genre(raw)
    if not key:
        return None
    if decisions and key in decisions:
        return decisions[key]
    if is_non_content_genre(key):
        return None
    return _CONTENT_INDEX.get(key, UNMAPPED)


_PROFILE_INDEX = {normalise_genre(key): value for key, value in PROFILE_GENRES.items()}


def resolve_profile_tag(raw: object,
                        decisions: Mapping[str, str | None] | None = None) -> tuple[str, ...] | None:
    """资料页一个标签的去向：几个 Peach 标签、空元组（不作为标签）、或 `None`（未收录）。

    用户的决定仍排第一；其次是资料专用的 `PROFILE_GENRES`，最后才落回作品那张表。
    """
    key = normalise_genre(raw)
    if not key:
        return ()
    if decisions and key in decisions:
        return (decisions[key],) if decisions[key] else ()
    if key in _PROFILE_INDEX:
        return _PROFILE_INDEX[key]
    tag = resolve_genre(raw)
    if tag == UNMAPPED:
        return None
    return (tag,) if tag else ()


def map_genres(genres: Iterable[object],
               decisions: Mapping[str, str | None] | None = None) -> tuple[list[str], list[str]]:
    """返回 (Peach 标签, 未收录原文)。已判定为非内容的原文两边都不出现。

    标签按首次出现去重保序；未收录原文原样回传，供调用方登记后补表。
    """
    tags: list[str] = []
    unmapped: list[str] = []
    seen_tags: set[str] = set()
    seen_unmapped: set[str] = set()
    for genre in genres or []:
        key = normalise_genre(genre)
        if not key:
            continue
        tag = resolve_genre(genre, decisions)
        if tag is None:
            continue
        if not tag:
            if key not in seen_unmapped:
                seen_unmapped.add(key)
                unmapped.append(" ".join(str(genre or "").split()))
            continue
        if tag not in seen_tags:
            seen_tags.add(tag)
            tags.append(tag)
    return tags, unmapped


#: 未收录原文在候选文件里的两种存法。`unmapped_genres` 是结构化的那份，`warnings`
#: 里那句话是给人读的。两样由同一个地方产出，反解也放在这里：2026-09-11 之前写下的
#: 候选文件只有那句话，而复核页要在它们上面就能把 genre 收录进来，不能等重抓一遍。
_UNMAPPED_GENRE_PREFIX = "来源还有 "
_UNMAPPED_GENRE_INFIX = " 个未收录 genre："


def unmapped_genre_warning(unmapped: list[str]) -> str:
    return f"{_UNMAPPED_GENRE_PREFIX}{len(unmapped)}{_UNMAPPED_GENRE_INFIX}" + "、".join(unmapped)


def genres_in_warning(text: object) -> list[str]:
    """从那句话里取回未收录原文；不是那句话就返回空。"""
    line = str(text or "")
    if not line.startswith(_UNMAPPED_GENRE_PREFIX) or _UNMAPPED_GENRE_INFIX not in line:
        return []
    return [part.strip() for part in line.split(_UNMAPPED_GENRE_INFIX, 1)[1].split("、") if part.strip()]
