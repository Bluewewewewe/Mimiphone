/**
 * LPMI 人格测试 — 20 题完整计分版
 * - 选项分值仅用于脚本累加，不在页面展示。
 * - 人格判定：getPersonalityCode（优先级与阈值见同文件内注释）。
 */

/** en：英文维度名；gloss：中文释义；pole*En：量表两端英文提示 */
const DIMENSIONS = {
  L: {
    code: 'L',
    en: 'Lore',
    gloss: '考古倾向：挖旧糖、恋旧、囤糖',
    left: '考古·囤糖',
    right: '当下',
    poleLeftEn: 'Lore',
    poleRightEn: 'Present',
  },
  P: {
    code: 'P',
    en: 'Plot',
    gloss: '脑补功率：空气编剧、甜向脑洞、日常小剧场',
    left: '脑补·剧场',
    right: '所见即所得',
    poleLeftEn: 'Plot',
    poleRightEn: 'Literal',
  },
  M: {
    code: 'M',
    en: 'Meticulous',
    gloss: '证据门槛：显微镜、讲证据、理糖点',
    left: '显微镜·证据',
    right: '同框即婚',
    poleLeftEn: 'Evidence',
    poleRightEn: 'Ship',
  },
  I: {
    code: 'I',
    en: 'Intensity',
    gloss: '情绪烈度：尖叫、分享欲 ↔ 冷静、佛系',
    left: '发癫·分享',
    right: '冷静佛系',
    poleLeftEn: 'Intensity',
    poleRightEn: 'Calm',
  },
};

const DIM_KEYS = ['L', 'P', 'M', 'I'];

/** 仅当仓库内有对应立绘时展示；未列出的类型不显示图 */
const CHAR_IMAGE_BY_CODE = {
  CHAF: 'assets/chars/tianyumi.png',
  SWEET: 'assets/chars/zhuanghuo-mi.png',
  BARK: 'assets/chars/goujiao-mi.png',
  BOIL: 'assets/chars/feiwu-mi.png',
  VAUL: 'assets/chars/cangshu-mi.png',
  CHLL: 'assets/chars/bailan-mi.png',
  MOSS: 'assets/chars/dingzihu-mi.png',
  JUDG: 'assets/chars/tiezui-mi.png',
  MONK: 'assets/chars/zhenyan-mi.png',
  MIST: 'assets/chars/xiangmei-mi.png',
};

/** 结果页随机一条搞笑小任务（与计分无关） */
const FUNNY_TASKS = [
  '偷田雷手机！',
  '在群里发一句「我签苞米协议了！」，然后立刻撤回，留下一个传说。',
  '随机挑选一个不幸运ndz气死他',
  '随机挑选一个不幸运xjs气死他',
  '对空气打一套拳击',
  '买一个雷子同款',
  '买一个月月同款',
  '挑战在vb一个月穿上黄裤衩',
  '找到聊天框最近的聊天的米米跟她表白吓她一下',
  '答应一个最近给你表白的米米吓她一下',
  '打开ao3开始产粮！',
  '打开剪辑软件开始产粮！',
  '私信雷子说我好像看到你了。',
  '私信月月说我好像看到你了',
  '明天六点起床十一点睡觉，学习一整天奖励自己一下',
  '明天睡一整天奖励自己一下',
  '给雷朋开支付宝小荷包存钱攒钱各100',
  '出门跑两圈然后奖励自己喝一杯茉莉奶白',
  '重刷逆爱以及花絮',
  '去一次无锡',
];

function pickRandomTask() {
  const i = Math.floor(Math.random() * FUNNY_TASKS.length);
  return FUNNY_TASKS[i];
}

/** @type {{ text: string, options: Record<string, { label: string } & Partial<Record<'L'|'P'|'M'|'I', number>>>}[]} */
const questions = [
  {
    text: '花絮很长时间没更新，米米会？',
    options: {
      A: { label: '米米 翻以前的甜蜜旧糖反复回味', L: 2, I: -2 },
      B: { label: '安静等待，相信雷子月月关系超好', M: 2, I: -1 },
      C: { label: '脑补雷子月月私下轻松相处的可爱日常', P: 3, I: 2 },
      D: { label: '无所谓啊，不放也不影响米米喜欢', L: -2, P: -2 },
    },
  },
  {
    text: '看到月月和雷子发同款穿搭图，米米第一反应是？',
    options: {
      A: { label: '放大看细节，找雷子月月温柔小互动', M: 3, L: -2, I: -1 },
      B: { label: '好好存起来，慢慢品', L: 3, I: -2 },
      C: { label: '立刻脑补一段甜甜的雷朋情侣小日常', P: 3, M: 2, I: 1 },
      D: { label: '觉得不错，随手划走，等下一次豹豹猫猫 营业！', P: -2, M: -2, I: 1 },
    },
  },
  {
    text: '有其他米米和米米你get同款糖点，米米会？',
    options: {
      A: { label: '开心交流，一起磕', L: -2, P: -2 },
      B: { label: '截图发群：“速来一起磕！”', I: 3, M: -2 },
      C: { label: '对比时间线，看看是不是同一个糖', M: 3, L: 2, I: -1 },
      D: { label: '正常看待，磕点相似很正常尼', I: -2, P: -2 },
    },
  },
  {
    text: '半夜刷到爸爸妈妈新糖，米米会？',
    options: {
      A: { label: '存好糖，安心甜甜睡觉', P: -2, I: -2 },
      B: { label: '越看越开心，忍不住多看亿会儿', L: 3, I: 2 },
      C: { label: '脑补爸爸妈妈甜甜的相处小片段', P: 3, L: 2, I: 1 },
      D: { label: '觉得这个糖特别有心意、很温暖', P: 3, M: -2, I: 2 },
    },
  },
  {
    text: '路人说“夸这对氛围好好”，米米会？',
    options: {
      A: { label: '点头认同，列出米米觉得甜的地方', M: 3, L: -2 },
      B: { label: '默默磕自己的，不参与讨论', P: -2, I: -2 },
      C: { label: '跟着路人一起夸氛围好', L: 2, I: -1 },
      D: { label: '赞同并开心分享米米自己的看法', L: -2, I: 2 },
    },
  },
  {
    text: '其中爸爸或者妈妈一方提到很温柔的一句话，米米会？',
    options: {
      A: { label: '认真记下，并分享 这份温柔尼', I: -2, P: -2 },
      B: { label: '激动转发：好温柔好甜！', I: 3, M: -2 },
      C: { label: '看上下文，理解完整意思', M: 3, P: 2, I: 1 },
      D: { label: '悄悄记下来，当成小糖点', L: 3, I: -2 },
    },
  },
  {
    text: '看到甜玉米大厨甜蜜日常剪辑，米米会？',
    options: {
      A: { label: '开心看完，心情变好啊', L: -2, I: 2 },
      B: { label: '全程姨母笑，看得超投入诶', I: 3, M: -2 },
      C: { label: '脑补雷子月月私下更可爱的互动尼', P: 3, L: 2, I: 1 },
      D: { label: '欣赏画面和节奏，静静观看进行中', M: 3, L: -2, I: -1 },
    },
  },
  {
    text: '有其他米米跟米米说米米早就知道的糖，米米会？',
    options: {
      A: { label: '微笑附和：是啊，超级甜齁甜！', I: -2, P: -2 },
      B: { label: '顺势补充更多爆糖小细节', M: 3, L: 3 },
      C: { label: '安静听完，觉得分享很可爱呀', P: 3, I: -1 },
      D: { label: '直接说：这个米米我早就磕到啦', I: 2, L: -2 },
    },
  },
  {
    text: '玩小逆爱名场面猜梗游戏，米米通常？',
    options: {
      A: { label: '记得很清楚，能说出时间和场景', M: 3, L: -2, I: -1 },
      B: { label: '凭感觉答，经常能蒙对', I: -2, P: -2 },
      C: { label: '靠脑补画面，猜得很准', P: 3, I: 2 },
      D: { label: '不太参与，跟着大家乐呵', L: 2, I: -2 },
    },
  },
  {
    text: '米米磕糖相关群的未读消息提醒？',
    options: {
      A: { label: '看到就点开，不想漏糖', I: 2, M: 3 },
      B: { label: '有一些，有空再看', I: -2, P: -2 },
      C: { label: '攒了很多，慢慢看', L: 3, I: -2 },
      D: { label: '关掉通知，随缘看', P: 2, I: -2 },
    },
  },
  {
    text: '花絮放出温柔互动片段，米米会？',
    options: {
      A: { label: '心里觉得甜，但表面装淡定', I: -1, P: 2 },
      B: { label: '认真看完，觉得很治愈', L: -2, P: -2 },
      C: { label: '开心到嘴角下不来', I: 3, M: -2 },
      D: { label: '观察细节，理解彼此的默契', M: 3, L: 2, I: -2 },
    },
  },
  {
    text: '米米磕糖的习惯顺序是？',
    options: {
      A: { label: '先看完整内容，再找糖点', M: 3, L: -2, I: -1 },
      B: { label: '直奔温柔名场面，反复看', L: -2, I: -1 },
      C: { label: '慢慢看，截图喜欢的画面', P: -2, I: 2 },
      D: { label: '先看别人分享，再自己磕', I: -2, L: 2 },
    },
  },
  {
    text: '米友说这对相处好自然，米米会？',
    options: {
      A: { label: '认同并说出米米感受到的细节', M: 3, L: 2, I: -1 },
      B: { label: '疯狂点头：真的超自然！', I: 3, P: 2 },
      C: { label: '脑补他们轻松舒服的相处模式', P: 3, I: -2 },
      D: { label: '安静赞同，不发表太多', P: -2, I: -2 },
    },
  },
  {
    text: '半夜突然想到一个超甜小细节，米米会？',
    options: {
      A: { label: '记在心里，明天再回味', I: -2, L: 2 },
      B: { label: '立刻开心记录下来，当成小灵感', I: 3, P: 2 },
      C: { label: '翻出相关内容再看一遍', P: -2, L: -2 },
      D: { label: '发群里：谁懂！这个细节好甜', I: 3, M: -2 },
    },
  },
  {
    text: '米米存爸妈图片的方式是？',
    options: {
      A: { label: '放在常用相册，方便翻看', P: -2, I: 2 },
      B: { label: '单独收藏，悄悄喜欢', I: -1, L: -2 },
      C: { label: '按场景/时间分类整理', M: 3, P: 3 },
      D: { label: '全部放在一起，不特意整理', L: 3, I: -2 },
    },
  },
  {
    text: '米友说这对看着很舒服，米米会？',
    options: {
      A: { label: '认真同意：确实很舒服啊', I: -2, M: 2 },
      B: { label: '疯狂赞同，分享米米最爱的点', I: 3, M: -2 },
      C: { label: '理解这种舒服感来自默契与温柔', P: 3, M: 3, I: -1 },
      D: { label: '淡定：一直都觉得爸妈超合拍', L: 3, I: -1 },
    },
  },
  {
    text: '路人说“这俩关系好好”，米米会？',
    options: {
      A: { label: '默默赞同，继续做自己的事', P: -2, I: -2 },
      B: { label: '悄悄开心，被认可了', M: 2, I: -1 },
      C: { label: '脑补路人也感受到他们的好氛围', P: 3, L: -2, I: 1 },
      D: { label: '开心分享：路人都看出来啦', I: 3, M: -2 },
    },
  },
  {
    text: '米米最喜欢的糖类型是？',
    options: {
      A: { label: '温柔细节、下意识关心', I: -1, P: 2 },
      B: { label: '明显又真诚的可爱互动', I: 3, M: -2 },
      C: { label: '自然氛围、默契感拉满', P: -2, I: -1 },
      D: { label: '经典旧糖、回忆里的温暖', L: 3, M: 2 },
    },
  },
  {
    text: '米米的CP粮（图/文/片段）库存？',
    options: {
      A: { label: '看完喜欢的留下，其他精简', L: -2, P: -2 },
      B: { label: '存了很多，舍不得删', L: 3, I: -2 },
      C: { label: '看到喜欢的就存，越存越多', I: 3, M: -2 },
      D: { label: '分类整理，清晰好找', M: 3, P: 2, I: -2 },
    },
  },
  {
    text: '结束遇见雷朋的25年，米米会？',
    options: {
      A: { label: '分享感受，记录这段开心时光', I: 3, M: -2 },
      B: { label: '回顾一路磕过的糖，满满温暖', M: 3, P: 2 },
      C: { label: '脑补爸爸妈妈一直这样开心相处下去', P: 3, L: 2, I: -1 },
      D: { label: '安静喜欢，不张扬不喧哗', P: -2, I: -2 },
    },
  },
];

/** 人格表见 personas.js（先于 app.js 加载） */

function computeBounds() {
  const min = { L: 0, P: 0, M: 0, I: 0 };
  const max = { L: 0, P: 0, M: 0, I: 0 };
  for (const q of questions) {
    const keys = Object.keys(q.options);
    for (const dim of DIM_KEYS) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const k of keys) {
        const v = q.options[k][dim] ?? 0;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      min[dim] += lo;
      max[dim] += hi;
    }
  }
  return { min, max };
}

const BOUNDS = computeBounds();

function percentForDim(raw, dim) {
  const lo = BOUNDS.min[dim];
  const hi = BOUNDS.max[dim];
  if (hi === lo) return 50;
  return ((raw - lo) / (hi - lo)) * 100;
}

function scoreAnswers(answers) {
  const raw = { L: 0, P: 0, M: 0, I: 0 };
  answers.forEach((choiceKey, i) => {
    const q = questions[i];
    const opt = q.options[choiceKey];
    if (!opt) return;
    for (const dim of DIM_KEYS) {
      raw[dim] += opt[dim] ?? 0;
    }
  });
  const pct = {};
  for (const dim of DIM_KEYS) {
    pct[dim] = Math.round(percentForDim(raw[dim], dim) * 10) / 10;
  }
  return { raw, pct };
}

/**
 * 根据四维原始分返回人格代号（英文）。
 * 优先级：BARK → SWEET → FREN → FURY → HUSK → SIRN → ARCH → TAP → CHAF → CHLL → 常规组合 → BOIL 兜底。
 */
function getPersonalityCode(scores) {
  const { L, P, M, I } = scores;

  if (I >= 15 && M < 0) return 'BARK';
  if (P >= 15 && L < 0 && M < 0 && I < 0) return 'SWEET';
  if (L < 0 && P >= 0 && M >= 0 && I >= 0 && P + M + I >= 20) return 'FREN';
  if (L >= 0 && P >= 0 && M >= 0 && I >= 10) return 'FURY';
  if (P >= 15 && L >= 0 && M < 0 && I >= 0) return 'HUSK';
  if (L < 0 && P < 0 && M < 0 && I >= 10) return 'SIRN';
  if (L >= 0 && M >= 10 && P < 0 && I < 0) return 'ARCH';
  if (L < 0 && P < 0 && M >= 8 && I >= 0) return 'TAP';
  if (Math.abs(L) <= 5 && Math.abs(P) <= 5 && M < 0 && I >= 0) return 'CHAF';

  if (L < 0 && P < 0 && M < 0 && I < -5) return 'CHLL';
  if (L < 0 && P < 0 && M < 0 && I >= 0) return 'BOIL';
  if (L < 0 && P < 0 && M >= 0 && I < 0) return 'JUDG';
  if (L < 0 && P >= 0 && M < 0 && I < 0) return 'MIST';
  if (L < 0 && P >= 0 && M < 0 && I >= 0) return 'STOM';
  if (L < 0 && P >= 0 && M >= 0 && I < 0) return 'VAUL';
  if (L >= 0 && P < 0 && M < 0 && I < 0) return 'MOSS';
  if (L >= 0 && P < 0 && M < 0 && I >= 0) return 'ECHO';
  if (L >= 0 && P < 0 && M >= 0 && I >= 0) return 'LOOP';
  if (L >= 0 && P >= 0 && M < 0 && I < 0) return 'ROOT';
  if (L >= 0 && P >= 0 && M >= 0 && I < 0) return 'MONK';

  return 'BOIL';
}

function pickPersona(raw) {
  const code = getPersonalityCode(raw);
  const table = typeof PERSONAS_BY_CODE !== 'undefined' ? PERSONAS_BY_CODE : {};
  return table[code] || table.BOIL;
}

/** 按「再抽象一点：」拆成两段展示 */
function renderEssay(container, text) {
  container.innerHTML = '';
  if (!text || !text.trim()) {
    container.innerHTML = '<p class="res-essay-para muted small">暂无解读</p>';
    return;
  }
  const mark = '再抽象一点：';
  const idx = text.indexOf(mark);
  const main = (idx === -1 ? text : text.slice(0, idx)).trim();
  const aside = idx === -1 ? '' : (mark + text.slice(idx + mark.length)).trim();
  const p1 = document.createElement('p');
  p1.className = 'res-essay-para';
  p1.textContent = main;
  container.appendChild(p1);
  if (aside) {
    const p2 = document.createElement('p');
    p2.className = 'res-essay-para res-essay-aside';
    p2.textContent = aside;
    container.appendChild(p2);
  }
}

function renderQuiz() {
  const total = questions.length;
  document.getElementById('total-q').textContent = String(total);
  let index = 0;
  const answers = [];

  function showQuestion() {
    const q = questions[index];
    document.getElementById('q-index').textContent = String(index + 1);
    document.getElementById('q-text').textContent = q.text;
    const pct = ((index + 1) / total) * 100;
    document.getElementById('progress-bar').style.width = `${pct}%`;

    const box = document.getElementById('options');
    box.innerHTML = '';
    const keys = Object.keys(q.options);
    keys.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn';
      const o = q.options[key];
      btn.innerHTML = `<span class="opt-key">${key}</span>${o.label}`;
      btn.addEventListener('click', () => {
        answers[index] = key;
        index += 1;
        if (index >= total) finish();
        else showQuestion();
      });
      box.appendChild(btn);
    });
  }

  function finish() {
    document.getElementById('screen-quiz').classList.add('hidden');
    document.getElementById('screen-result').classList.remove('hidden');
    showResult(answers);
  }

  showQuestion();
}

function showResult(answers) {
  const { raw, pct } = scoreAnswers(answers);
  const persona = pickPersona(raw);

  const displayName = persona.name.endsWith('米') ? persona.name : `${persona.name}米`;
  document.getElementById('res-name-cn').textContent = displayName;
  document.getElementById('res-code').textContent = persona.code;
  document.getElementById('res-tagline').textContent = persona.tagline;
  const taskEl = document.getElementById('res-task-body');
  if (taskEl) taskEl.textContent = pickRandomTask();
  renderEssay(document.getElementById('res-essay'), persona.essay || '');

  const charPath = CHAR_IMAGE_BY_CODE[persona.code];
  const portraitEl = document.getElementById('res-char-portrait');
  if (portraitEl) {
    if (charPath) {
      portraitEl.hidden = false;
      portraitEl.innerHTML = `<img class="res-char-img" src="${charPath}" alt="${displayName} 形象" loading="lazy" decoding="async" />`;
    } else {
      portraitEl.hidden = true;
      portraitEl.innerHTML = '';
    }
  }

  const bars = document.getElementById('dim-bars');
  bars.innerHTML = '';
  DIM_KEYS.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'dim-row';
    const di = DIMENSIONS[d];
    const p = pct[d];
    row.innerHTML = `
      <div class="dim-row-top">
        <div class="dim-label-block">
          <div class="dim-line dim-line-en">${di.code} · ${di.en}</div>
          <div class="dim-line dim-line-gloss">${di.gloss}</div>
          <div class="dim-line dim-line-stat">${p}% 倾向「${di.left}」</div>
        </div>
        <span class="dim-pct">${p}%</span>
      </div>
      <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${p}%"></div></div>
      <div class="dim-poles">
        <div class="dim-pole">
          <span class="dim-pole-cn">${di.left}</span>
          <span class="dim-pole-en">${di.poleLeftEn}</span>
        </div>
        <div class="dim-pole dim-pole-right">
          <span class="dim-pole-cn">${di.right}</span>
          <span class="dim-pole-en">${di.poleRightEn}</span>
        </div>
      </div>
    `;
    bars.appendChild(row);
  });

  const grid = document.getElementById('dim-detail-cards');
  grid.innerHTML = '';
  const detailMap = {
    L: persona.detailL,
    P: persona.detailP,
    M: persona.detailM,
    I: persona.detailI,
  };
  DIM_KEYS.forEach((d) => {
    const di = DIMENSIONS[d];
    const card = document.createElement('div');
    card.className = 'detail-card';
    card.innerHTML = `
      <div class="detail-card-top">
        <div class="detail-card-title-block">
          <div class="detail-card-line detail-card-line-en">${di.code} · ${di.en}</div>
          <div class="detail-card-line detail-card-line-gloss">${di.gloss}</div>
          <div class="detail-card-line detail-card-line-axis">${di.left} / ${di.right}</div>
        </div>
        <span class="detail-card-score">${pct[d]}%</span>
      </div>
      <div class="detail-card-progress" aria-hidden="true">
        <div class="dim-bar-track"><div class="dim-bar-fill" style="width:${pct[d]}%"></div></div>
      </div>
      <div class="detail-card-body">${detailMap[d]}</div>
    `;
    grid.appendChild(card);
  });
}

document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('screen-intro').classList.add('hidden');
  document.getElementById('screen-quiz').classList.remove('hidden');
  renderQuiz();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  document.getElementById('screen-result').classList.add('hidden');
  document.getElementById('screen-quiz').classList.remove('hidden');
  renderQuiz();
});

document.getElementById('btn-close').addEventListener('click', () => {
  // 通过 postMessage 通知父页面关闭 LPMI
  window.parent.postMessage({ type: 'lpmi-close' }, '*');
});
