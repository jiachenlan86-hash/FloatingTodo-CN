'use strict';

const WEEKDAYS = {
  '周日': 0, '星期日': 0, '周天': 0, '星期天': 0,
  '周一': 1, '星期一': 1,
  '周二': 2, '星期二': 2,
  '周三': 3, '星期三': 3,
  '周四': 4, '星期四': 4,
  '周五': 5, '星期五': 5,
  '周六': 6, '星期六': 6
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function localIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function atTime(date, hour = 18, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function parseChineseNumber(value) {
  const text = String(value || '').trim();
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  if (text === '十') return 10;
  if (text.includes('十')) {
    const [tens, ones] = text.split('十');
    return (tens ? (digits[tens] ?? 0) : 1) * 10 + (ones ? (digits[ones] ?? 0) : 0);
  }
  return digits[text] ?? Number.NaN;
}

function parseClock(text) {
  const colon = text.match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/);
  if (colon) return [Number(colon[1]), Number(colon[2])];

  const chinese = text.match(/(?:(上午|早上|中午|下午|晚上|今晚|明晚)\s*)?([0-9一二两三四五六七八九十]{1,3})\s*[点时](?:\s*(半|[0-9一二两三四五六七八九十]{1,3})\s*分?)?/);
  if (chinese) {
    let hour = parseChineseNumber(chinese[2]);
    const period = chinese[1] || '';
    if (['下午', '晚上', '今晚', '明晚'].includes(period) && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    if (['上午', '早上'].includes(period) && hour === 12) hour = 0;
    const minute = chinese[3] === '半' ? 30 : (chinese[3] ? parseChineseNumber(chinese[3]) : 0);
    if (hour <= 23 && minute <= 59) return [hour, minute];
  }

  if (/下班前|今天内|今日内/.test(text)) return [18, 0];
  if (/中午前/.test(text)) return [12, 0];
  if (/上午/.test(text)) return [10, 0];
  if (/下午/.test(text)) return [17, 0];
  if (/晚上|今晚/.test(text)) return [20, 0];
  return null;
}

function parseDueAt(text, now = new Date()) {
  const value = String(text || '');
  const clock = parseClock(value);
  let target = null;

  const fullDate = value.match(/(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})[日号]?/);
  const shortDate = value.match(/(?:^|\D)(\d{1,2})[月\/-](\d{1,2})[日号]?(?:\D|$)/);

  if (fullDate) {
    target = new Date(Number(fullDate[1]), Number(fullDate[2]) - 1, Number(fullDate[3]));
  } else if (shortDate) {
    target = new Date(now.getFullYear(), Number(shortDate[1]) - 1, Number(shortDate[2]));
    if (target < atTime(now, 0, 0)) target.setFullYear(target.getFullYear() + 1);
  } else if (/大后天/.test(value)) {
    target = new Date(now);
    target.setDate(target.getDate() + 3);
  } else if (/后天/.test(value)) {
    target = new Date(now);
    target.setDate(target.getDate() + 2);
  } else if (/明天|明早|明晚|次日/.test(value)) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
  } else if (/今天|今日|今晚|今早|下班前/.test(value)) {
    target = new Date(now);
  } else {
    for (const [label, weekday] of Object.entries(WEEKDAYS)) {
      if (!value.includes(label)) continue;
      target = new Date(now);
      let delta = (weekday - now.getDay() + 7) % 7;
      if (/下周/.test(value)) delta = delta === 0 ? 7 : delta + 7;
      else if (delta === 0 && atTime(now, ...(clock || [18, 0])) <= now) delta = 7;
      target.setDate(target.getDate() + delta);
      break;
    }
  }

  if (!target && /本周|这周|周末/.test(value)) {
    target = new Date(now);
    const delta = (7 - target.getDay()) % 7;
    target.setDate(target.getDate() + delta);
  }

  if (!target && clock) target = new Date(now);
  if (!target) return null;
  const [hour, minute] = clock || [18, 0];
  return localIso(atTime(target, hour, minute));
}

function inferPriority(text, dueAt, now = new Date()) {
  if (/不急|有空|方便时|以后再说|低优先/.test(text)) return 'low';
  if (/紧急|急|马上|立即|务必|优先|尽快|重要|截止|最晚|一定要/.test(text)) return 'high';
  if (dueAt && dueAt.slice(0, 10) === localIso(now).slice(0, 10)) return 'high';
  return 'medium';
}

function inferCategory(text) {
  if (/等待|等(待)?[^，。；\n]{0,12}(回复|确认|反馈|审批|结果|消息)|待回复|催一下|跟进/.test(text)) return '等待他人';
  if (/客户|订单|报价|合同|发票|会议|方案|项目|工作|同事|老板|张总|李总/.test(text)) return '工作';
  if (/买|采购|快递|取件|缴费|家里|生活|预约|医院|体检/.test(text)) return '生活';
  if (/学习|课程|复习|考试|阅读|论文/.test(text)) return '学习';
  return '其他';
}

function cleanTitle(text) {
  return String(text || '')
    .replace(/^\s*[-*•·□☐✅✔️\d.、）)]+\s*/, '')
    .replace(/^\s*(?:我|自己|好友|对方|客户|同事|老板|[\u4e00-\u9fa5A-Za-z]{1,12})\s*[：:]\s*/, '')
    .replace(/(?:麻烦|请你|请|记得|别忘了|需要|帮我|帮忙)\s*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[。；;，,！!]+$/g, '')
    .trim()
    .slice(0, 72);
}

function splitCandidates(text) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/[•●▪◦]/g, '\n- ')
    .replace(/(?:另外|同时|还有|并且|然后)[，,:：]?/g, '\n')
    .replace(/[；;]/g, '\n');

  let lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  lines = lines.filter((line) => !/^\d{1,2}:\d{2}$/.test(line) && !/^[\[【(（].*[\]】)）]$/.test(line));
  if (lines.length === 1 && lines[0].length > 90) {
    lines = lines[0].split(/(?<=[。！？!?])\s*/).filter(Boolean);
  }
  return lines.slice(0, 8);
}

function structureWithRules(text, now = new Date()) {
  const source = String(text || '').trim();
  const candidates = splitCandidates(source);
  const usable = candidates.length ? candidates : [source || '新待办'];
  return usable.map((candidate) => {
    const title = cleanTitle(candidate) || '新待办';
    const dueAt = parseDueAt(candidate, now) || parseDueAt(source, now);
    return {
      title,
      dueAt,
      priority: inferPriority(candidate, dueAt, now),
      category: inferCategory(candidate),
      notes: candidate === source ? '' : candidate,
      source: 'rules'
    };
  });
}

function sectionForTask(task, now = new Date()) {
  if (task.status === 'completed') return 'completed';
  if (task.category === '等待他人') return 'waiting';
  if (!task.due_at && !task.dueAt) return 'later';
  const due = new Date(task.due_at || task.dueAt);
  const todayEnd = atTime(now, 23, 59);
  if (due <= todayEnd) return 'today';
  const weekEnd = atTime(now, 23, 59);
  weekEnd.setDate(weekEnd.getDate() + ((7 - weekEnd.getDay()) % 7));
  if (due <= weekEnd) return 'week';
  return 'later';
}

module.exports = {
  cleanTitle,
  inferCategory,
  inferPriority,
  localIso,
  parseChineseNumber,
  parseDueAt,
  sectionForTask,
  splitCandidates,
  structureWithRules
};
