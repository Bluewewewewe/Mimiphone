import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { buildHeartbeatPrompt, getParentStatus, getMomStatus, type ParentStatusInfo, DAD_PROFILE, MOM_PROFILE } from '@/lib/world-book';
import { getModelForScene } from '@/lib/config';
import { requireAuthRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 心跳系统 - 灵感来自 dylan-heartbeat
 *
 * 核心机制：
 * 1. 前端每隔一段时间调用此API
 * 2. API根据当前时间和爸妈状态，决定是否让爸妈主动联系米米
 * 3. AI自主决定是否发消息（不强制）
 * 4. 返回 { shouldAct: boolean, messages: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthRequest(request);

    const {
      recentMessages = [],    // 最近聊天记录
      currentApp = 'home',   // 当前在哪个APP
    } = await request.json();

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // 获取爸妈当前状态
    const dadStatus = getParentStatus(hour);
    const momStatus = getMomStatus(hour);

    // 深夜降低主动联系概率但不完全禁止
    const isLateNight = hour >= 23 || hour < 7;

    // 计算距离最后一条用户消息的时间
    const lastUserMsg = [...recentMessages].reverse().find((m: { from: string }) => m.from === 'me');
    let minutesSinceLastUser = 999;
    if (lastUserMsg) {
      // 简单估算：从消息时间推算
      minutesSinceLastUser = 30; // 默认30分钟
    }

    // 根据时间段调整唤醒间隔
     // 白天45分钟，夜间120分钟

    // 如果用户刚聊过天，不主动联系
    if (minutesSinceLastUser < 5) {
      return new Response(JSON.stringify({
        shouldAct: false,
        reason: '用户刚聊过天',
        messages: []
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 随机决定谁主动联系
    const results: Array<{ speaker: string; text: string; toPartner?: boolean }> = [];

    // 决定谁可能主动联系
    const possibleActors: Array<{ speaker: string; status: ParentStatusInfo }> = [];

    if (!dadStatus.status.includes('睡觉') || isLateNight) {
      possibleActors.push({ speaker: 'dad', status: dadStatus });
    }
    if (!momStatus.status.includes('睡觉') || isLateNight) {
      possibleActors.push({ speaker: 'mom', status: momStatus });
    }

    const rand = Math.random();
    // 深夜大幅降低主动概率
    const actThreshold = isLateNight ? 0.05 : 0.12;  // 深夜5%/白天12%
    const bothThreshold = isLateNight ? 0.07 : 0.28;  // 深夜7%/白天28%
    const partnerThreshold = isLateNight ? 0.10 : 0.55; // 深夜10%/白天55%
    let actorsToAct: Array<{ speaker: string; status: ParentStatusInfo }> = [];
    // 是否让爸妈互聊（不联系米米，两人自己在家庭群聊天）
    let partnerChat = false;

    if (possibleActors.length >= 2) {
      if (rand < actThreshold) actorsToAct = [possibleActors[0]];       // 白天12%/深夜5% 爸爸主动找米米
      else if (rand < actThreshold * 2) actorsToAct = [possibleActors[1]]; // 白天12%/深夜5% 妈咪主动找米米
      else if (rand < bothThreshold) actorsToAct = possibleActors;      // 白天4%/深夜2% 两人都找米米
      else if (rand < partnerThreshold) partnerChat = true;             // 白天27%/深夜3% 爸妈互聊
      // 白天45%/深夜90% 什么都不做
    } else if (possibleActors.length === 1) {
      if (rand < (isLateNight ? 0.05 : 0.15)) actorsToAct = [possibleActors[0]];
    }

    // 爸妈互聊模式：两人在家庭群聊天，不找米米
    if (partnerChat && possibleActors.length >= 2) {
      try {
        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        const config = new Config();
        const client = new LLMClient(config, customHeaders);

        // 随机决定谁先开口
        const firstSpeaker = Math.random() < 0.5 ? 'dad' : 'mom';
        const secondSpeaker = firstSpeaker === 'dad' ? 'mom' : 'dad';
        const firstStatus = firstSpeaker === 'dad' ? dadStatus : momStatus;
        const secondStatus = secondSpeaker === 'dad' ? dadStatus : momStatus;

        const partnerChatPrompt = (speaker: string, status: ParentStatusInfo, partnerName: string, partnerActivity: string, timeStr: string) => {
          const whoName = speaker === 'dad' ? '田雷（爸爸）' : '梓渝（妈咪）';
          const profile = speaker === 'dad' ? DAD_PROFILE : MOM_PROFILE;
          return `你正在家庭群里和${partnerName}聊天（不是跟米米，米米不在）。你现在是${whoName}，${status.emoji} ${status.status}（正在${status.activity}）。${partnerName}正在${partnerActivity}。当前时间${timeStr}。
请用一句话（20字以内）跟${partnerName}说点什么，可以是吐槽、撒娇、日常关心。内容要和当前活动/时间相关，不要重复之前说过的话。直接输出内容，不要加前缀和引号。
${profile}`;
        };

        const firstPrompt = partnerChatPrompt(firstSpeaker, firstStatus, firstSpeaker === 'dad' ? '梓渝' : '田雷', secondStatus.activity, timeStr);
        const firstMessages: Array<{ role: 'system' | 'user'; content: string }> = [
          { role: 'system', content: firstPrompt },
          { role: 'user', content: `你想跟${firstSpeaker === 'dad' ? '梓渝' : '田雷'}说点什么？直接说内容（20字以内），不想说就输出[NO_ACTION]` },
        ];

        const heartbeatModel = getModelForScene('heartbeat');
        let firstText = '';
        const stream1 = client.stream(firstMessages, { model: heartbeatModel, temperature: 0.9 });
        for await (const chunk of stream1) { if (chunk.content) firstText += chunk.content.toString(); }
        const cleanFirst = firstText.trim().replace(/^(田雷|田栩宁|梓渝|郑朋|爸爸|妈咪)[：:]\s*/, '').replace(/^["「『]|["」』]$/g, '').trim();

        if (cleanFirst.length > 0 && !cleanFirst.startsWith('[NO_ACTION]')) {
          results.push({ speaker: firstSpeaker, text: cleanFirst, toPartner: true });

          // 第二个人70%概率回复
          if (Math.random() < 0.7) {
            const secondPrompt = partnerChatPrompt(secondSpeaker, secondStatus, secondSpeaker === 'dad' ? '梓渝' : '田雷', firstStatus.activity, timeStr);
            const secondMessages: Array<{ role: 'system' | 'user'; content: string }> = [
              { role: 'system', content: secondPrompt },
              { role: 'user', content: `${firstSpeaker === 'dad' ? '田雷' : '梓渝'}在家庭群里说了：「${cleanFirst}」，你回复一下？直接说内容（20字以内），不想回就输出[NO_ACTION]` },
            ];
            let secondText = '';
            const stream2 = client.stream(secondMessages, { model: heartbeatModel, temperature: 0.9 });
            for await (const chunk of stream2) { if (chunk.content) secondText += chunk.content.toString(); }
            const cleanSecond = secondText.trim().replace(/^(田雷|田栩宁|梓渝|郑朋|爸爸|妈咪)[：:]\s*/, '').replace(/^["「『]|["」』]$/g, '').trim();
            if (cleanSecond.length > 0 && !cleanSecond.startsWith('[NO_ACTION]')) {
              results.push({ speaker: secondSpeaker, text: cleanSecond, toPartner: true });
            }
          }
        }
      } catch (err) {
        console.error('Partner chat error:', err);
      }
    }

    if (actorsToAct.length === 0) {
      return new Response(JSON.stringify({
        shouldAct: false,
        reason: 'AI自主选择不联系',
        messages: []
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 为每个主动的家长生成消息
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // 构建最近的对话上下文
    const historyText = recentMessages
      .slice(-10)
      .map((m: { from: string; text: string }) => {
        const nameMap: Record<string, string> = { me: '米米', dad: '爸爸', mom: '妈咪', system: '系统' };
        return `[${nameMap[m.from] || m.from}] ${m.text}`;
      })
      .join('\n');

    for (const actor of actorsToAct) {
      const prompt = buildHeartbeatPrompt(actor.speaker, actor.status, timeStr, historyText, currentApp);

      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: prompt },
        { role: 'user', content: `现在是${timeStr}，你正在${actor.status.activity}。决定一下要不要主动联系米米？如果想联系，直接写你想说的话（一句话，30字以内），注意不能重复上面的对话记录。如果不想，只输出[NO_ACTION]。` },
      ];

      try {
        const hbModel = getModelForScene('heartbeat');
        let fullText = '';
        const stream = client.stream(messages, {
          model: hbModel,
          temperature: 0.85,
        });

        for await (const chunk of stream) {
          if (chunk.content) {
            fullText += chunk.content.toString();
          }
        }

        const trimmed = fullText.trim();

        // AI选择不发消息
        if (trimmed.startsWith('[NO_ACTION]')) {
          continue;
        }

        // 清理AI可能加的前缀
        let cleanText = trimmed
          .replace(/^(田雷|田栩宁|梓渝|郑朋|爸爸|妈咪)[：:]\s*/, '')
          .replace(/^["「『]|["」』]$/g, '')
          .trim();

        if (cleanText.length > 0 && cleanText.length <= 50) {
          results.push({ speaker: actor.speaker, text: cleanText });
        }
      } catch (err) {
        console.error('Heartbeat generate error:', err);
        // 失败时使用默认消息
        const defaults = actor.speaker === 'dad'
          ? ['在干嘛呢', '吃饭了没', '想你了', '作业写完了没']
          : ['宝贝在干嘛呀', '妈咪想你了', '今天开心吗', '吃水果了没'];
        results.push({ speaker: actor.speaker, text: defaults[Math.floor(Math.random() * defaults.length)] });
      }
    }

    return new Response(JSON.stringify({
      shouldAct: results.length > 0,
      messages: results
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Heartbeat API error:', error);
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
