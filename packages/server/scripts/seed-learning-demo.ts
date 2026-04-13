/**
 * Learning Copilot v2.0 Demo Seed
 *
 * 为测试环境造一份丰富的 Learning Copilot 演示数据，让 Byron 可以把功能
 * 统一过一遍——不依赖真实 LLM 调用。
 *
 * 包含：
 *   - 1 个 Objective + 3 个 KR（一个 on_track、一个 behind、一个僵死）
 *   - ~12 个 Hypothesis（BACKLOG / RUNNING / CLOSED_WIN / CLOSED_LOSS 各覆盖）
 *   - 部分带 ICE/RICE 打分
 *   - 2 个假设带 A/B Variants（含显著/不显著对比）
 *   - 部分 CLOSED 的带 HypothesisResult + AI_GENERATED Learning
 *   - 手工拼一份 CopilotDigest（alerts + patterns + suggestions + learnings）
 *     让 Dashboard 右侧 Copilot 面板立刻有东西看
 *
 * 用法：
 *   cd packages/server && npx tsx scripts/seed-learning-demo.ts
 *
 * 幂等：有标记 `[demo]` 的数据被识别后全部清掉再重建。
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_TAG = '[demo-learning]'

async function cleanup() {
  // 按依赖顺序清理所有带 demo 标签的记录
  // Hypothesis / Learning / Variant / Result 通过 Hypothesis.statement 包含 tag 判定
  const hypothesesToDelete = await prisma.hypothesis.findMany({
    where: { statement: { contains: DEMO_TAG } },
    select: { id: true },
  })
  const hids = hypothesesToDelete.map((h) => h.id)

  if (hids.length > 0) {
    await prisma.learning.deleteMany({ where: { hypothesisId: { in: hids } } })
    await prisma.hypothesisVariant.deleteMany({
      where: { hypothesisId: { in: hids } },
    })
    await prisma.hypothesisResult.deleteMany({
      where: { hypothesisId: { in: hids } },
    })
    await prisma.hypothesis.deleteMany({ where: { id: { in: hids } } })
  }

  // Digest 按 scope prefix demo:
  await prisma.copilotDigest.deleteMany({
    where: { scope: { startsWith: 'project:demo' } },
  })

  // KR 按 name 包含 tag
  const krsToDelete = await prisma.keyResult.findMany({
    where: { name: { contains: DEMO_TAG } },
    select: { id: true },
  })
  if (krsToDelete.length > 0) {
    await prisma.keyResult.deleteMany({
      where: { id: { in: krsToDelete.map((k) => k.id) } },
    })
  }

  const objsToDelete = await prisma.objective.findMany({
    where: { name: { contains: DEMO_TAG } },
    select: { id: true },
  })
  if (objsToDelete.length > 0) {
    await prisma.objective.deleteMany({
      where: { id: { in: objsToDelete.map((o) => o.id) } },
    })
  }

  console.log(
    `[seed] cleaned ${hids.length} hypotheses, ${krsToDelete.length} KRs, ${objsToDelete.length} objectives`,
  )
}

async function main() {
  console.log('[seed] Learning Copilot demo 数据种子\n')

  // 1. 找一个 admin + project
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) {
    throw new Error('请先运行 seed-admin.ts 创建管理员')
  }

  const project = await prisma.project.findFirst({
    orderBy: { createdAt: 'asc' },
  })
  if (!project) {
    throw new Error('请先至少创建一个项目')
  }
  console.log(`[seed] 使用 admin=${admin.email} project=${project.name}`)

  // 2. 清理旧 demo 数据
  await cleanup()

  // 3. 创建 Objective + 3 KRs
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1) // 本月 1 号
  const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0) // 两个月后末

  const objective = await prisma.objective.create({
    data: {
      projectId: project.id,
      name: `${DEMO_TAG} 新用户激活体验`,
      description: '2026 Q2 核心增长目标：通过激活漏斗优化把新用户留存拉起来',
      createdById: admin.id,
    },
  })
  console.log(`[seed] Objective 创建 id=${objective.id}`)

  // KR1: 新用户首日留存，进度正常（on_track）
  const kr1 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      name: `${DEMO_TAG} 新用户首日留存率`,
      baseline: 20,
      currentValue: 26,
      targetValue: 30,
      unit: '%',
      startDate,
      endDate,
    },
  })

  // KR2: 7 日留存，落后（behind）
  const kr2 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      name: `${DEMO_TAG} 新用户 7 日留存率`,
      baseline: 8,
      currentValue: 9.5,
      targetValue: 15,
      unit: '%',
      startDate,
      endDate,
    },
  })

  // KR3: 付费转化，僵死（过去 10 天无新 RUNNING）
  const kr3 = await prisma.keyResult.create({
    data: {
      objectiveId: objective.id,
      name: `${DEMO_TAG} 新用户首周付费转化率`,
      baseline: 1.2,
      currentValue: 1.3,
      targetValue: 3.0,
      unit: '%',
      startDate,
      endDate,
    },
  })
  console.log(`[seed] 3 个 KR 创建完毕`)

  // 4. Hypothesis——按 PRD §6.4 的样子造一批
  //    关键：造出"push 方向连 3 次失败" + "视频引导方向连 2 次胜出" 的 pattern

  // 时间工具：返回 N 天前
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000)

  const hypotheses = [
    // ========== KR1: 首日留存 —— 有活跃尝试，有胜有败 ==========
    {
      krId: kr1.id,
      statement: `${DEMO_TAG} 如果在 Onboarding 首屏加一段 15 秒视频引导，则新用户首日留存会从 20% 提升到 25%`,
      mechanism: '视频比静态截图更能在 3 秒内传递"产品是干嘛的"，降低理解成本',
      expectedImpact: '+5pp 首日留存',
      status: 'CLOSED_WIN' as const,
      iceImpact: 8,
      iceConfidence: 7,
      iceEase: 6,
      iceScore: (8 * 7 * 6) / 10,
      closedAt: daysAgo(10),
      result: {
        metricType: 'conversion_rate',
        metricName: '首日留存率',
        baseline: 20.0,
        actual: 26.3,
        delta: 6.3,
        unit: '%',
        conclusion: 'WIN' as const,
        humanNote: '超预期，视频比预想的更有效',
      },
      learning: {
        text: '**视频引导方向验证有效**：15 秒视频让首日留存从 20% → 26.3%，超过预期 1.3pp。核心在于"3 秒内看到产品能做什么"，建议 Home 页 CTA 也用视频替换静态图。',
      },
    },
    {
      krId: kr1.id,
      statement: `${DEMO_TAG} 如果在首屏视频下方加"跳过引导"按钮，则老用户完成率会提升`,
      mechanism: '让回访老用户能快速绕过引导流，不被新手流程打断',
      expectedImpact: '+3pp 老用户回访完成率',
      status: 'CLOSED_FLAT' as const,
      parentStatement: null,
      iceImpact: 5,
      iceConfidence: 6,
      iceEase: 9,
      iceScore: (5 * 6 * 9) / 10,
      closedAt: daysAgo(7),
      result: {
        metricType: 'conversion_rate',
        metricName: '老用户回访完成率',
        baseline: 72.0,
        actual: 72.4,
        delta: 0.4,
        unit: '%',
        conclusion: 'FLAT' as const,
        humanNote: '改动太小，数据波动范围内',
      },
      learning: {
        text: '**"跳过引导"按钮影响极小**：老用户回访完成率 72% → 72.4%，在 noise 范围。说明老用户本来就会自己绕过引导，加按钮是伪需求。',
      },
    },
    {
      krId: kr1.id,
      statement: `${DEMO_TAG} 如果把 Home 页的静态 hero 图换成循环播放的产品演示视频，则首日留存会从 26% 提升到 29%`,
      mechanism: '延续上一次视频引导的胜出方向——视频让用户更快理解价值',
      expectedImpact: '+3pp 首日留存',
      status: 'RUNNING' as const,
      iceImpact: 7,
      iceConfidence: 8, // confidence 高因为上一次胜了
      iceEase: 5,
      iceScore: (7 * 8 * 5) / 10,
    },

    // ========== KR2: 7 日留存 —— 推送通知方向连 3 次失败（dead_direction）==========
    {
      krId: kr2.id,
      statement: `${DEMO_TAG} 如果在用户注册第 3 天发一条"还没用过 X 功能"的 push 通知，则 7 日留存会从 8% 提升到 12%`,
      mechanism: '第 3 天是留存曲线断崖期，push 召回能拉回流失边缘用户',
      expectedImpact: '+4pp 7 日留存',
      status: 'CLOSED_LOSS' as const,
      iceImpact: 7,
      iceConfidence: 6,
      iceEase: 8,
      iceScore: (7 * 6 * 8) / 10,
      closedAt: daysAgo(28),
      result: {
        metricType: 'conversion_rate',
        metricName: '7 日留存率',
        baseline: 8.0,
        actual: 7.6,
        delta: -0.4,
        unit: '%',
        conclusion: 'LOSS' as const,
        humanNote: '反而降了，可能因为 push 太早打扰',
      },
      learning: {
        text: '**第 3 天 push 失败**：7 日留存 8% → 7.6%，反向下滑。推测 push 打扰感强过召回价值。',
      },
    },
    {
      krId: kr2.id,
      statement: `${DEMO_TAG} 如果把第 3 天 push 改成第 5 天发，并用"你的好友 @XX 刚完成 Y"社交文案，则 7 日留存会提升 3pp`,
      mechanism: '社交证明文案比通用召回更有说服力',
      expectedImpact: '+3pp 7 日留存',
      status: 'CLOSED_LOSS' as const,
      iceImpact: 6,
      iceConfidence: 6,
      iceEase: 7,
      iceScore: (6 * 6 * 7) / 10,
      closedAt: daysAgo(18),
      result: {
        metricType: 'conversion_rate',
        metricName: '7 日留存率',
        baseline: 8.2,
        actual: 8.1,
        delta: -0.1,
        unit: '%',
        conclusion: 'LOSS' as const,
        humanNote: '没效果，文案再改也白搭',
      },
      learning: {
        text: '**第 5 天社交 push 仍然失败**：7 日留存 8.2% → 8.1%，改时间点 + 改文案均无效。',
      },
    },
    {
      krId: kr2.id,
      statement: `${DEMO_TAG} 如果把 push 通知的发送时间改到用户注册当天晚上 8 点，则 7 日留存会提升 4pp`,
      mechanism: '注册当天是用户对产品最热的时候，晚上 8 点打开率最高',
      expectedImpact: '+4pp 7 日留存',
      status: 'CLOSED_LOSS' as const,
      iceImpact: 7,
      iceConfidence: 5,
      iceEase: 8,
      iceScore: (7 * 5 * 8) / 10,
      closedAt: daysAgo(8),
      result: {
        metricType: 'conversion_rate',
        metricName: '7 日留存率',
        baseline: 8.3,
        actual: 8.0,
        delta: -0.3,
        unit: '%',
        conclusion: 'LOSS' as const,
        humanNote: '推送召回这条路走不通，需要 pivot',
      },
      learning: {
        text: '**推送通知方向 3 次实验全部失败**：无论改时间（3 天 / 5 天 / 当天晚 8 点）还是改文案（通用/社交证明），7 日留存均无正向。结论：push 召回对本产品新用户无效，应该放弃该方向。建议 pivot 到 in-app 任务型引导。',
      },
    },
    {
      krId: kr2.id,
      statement: `${DEMO_TAG} 如果给新用户设计一个 3 步在线任务（完成得 Y 币），则 7 日留存会从 8% 提升到 11%`,
      mechanism: 'in-app 任务流比外部 push 更能留住用户，且有即时正反馈',
      expectedImpact: '+3pp 7 日留存',
      status: 'RUNNING' as const,
      iceImpact: 7,
      iceConfidence: 7,
      iceEase: 4,
      iceScore: (7 * 7 * 4) / 10,
    },

    // ========== KR3: 付费转化 —— 僵死（过去 10 天无新 RUNNING）==========
    {
      krId: kr3.id,
      statement: `${DEMO_TAG} 如果在用户注册第 3 天展示首月 50% 折扣弹窗，则付费转化率会从 1.2% 提升到 2.5%`,
      mechanism: '早期折扣是 freemium 转化最常用的手段',
      expectedImpact: '+1.3pp 付费转化',
      status: 'CLOSED_LOSS' as const,
      iceImpact: 9,
      iceConfidence: 6,
      iceEase: 7,
      iceScore: (9 * 6 * 7) / 10,
      closedAt: daysAgo(15),
      result: {
        metricType: 'conversion_rate',
        metricName: '首周付费转化率',
        baseline: 1.2,
        actual: 1.3,
        delta: 0.1,
        unit: '%',
        conclusion: 'FLAT' as const,
        humanNote: '折扣力度不够大，或者 3 天太早',
      },
      learning: {
        text: '**首月 5 折弹窗效果极弱**：付费转化 1.2% → 1.3%，几乎无变化。可能折扣 pitch 太早或力度不够。',
      },
    },
    {
      krId: kr3.id,
      statement: `${DEMO_TAG} 如果把免费试用期从 7 天改成 14 天，则首周付费转化会提升到 2.0%`,
      mechanism: '14 天让用户有更多机会建立习惯，到期后更可能付费',
      expectedImpact: '+0.8pp 付费转化',
      status: 'BACKLOG' as const,
      iceImpact: 8,
      iceConfidence: 6,
      iceEase: 5,
      iceScore: (8 * 6 * 5) / 10,
    },
    {
      krId: kr3.id,
      statement: `${DEMO_TAG} 如果在达到 aha moment 的瞬间弹出"升级解锁高级功能"，则付费转化会提升到 2.2%`,
      mechanism: 'Aha moment 是用户最认可产品价值的时刻，此时 pitch 转化最高',
      expectedImpact: '+1pp 付费转化',
      status: 'BACKLOG' as const,
      iceImpact: 9,
      iceConfidence: 7,
      iceEase: 4,
      iceScore: (9 * 7 * 4) / 10,
    },
    {
      krId: kr3.id,
      statement: `${DEMO_TAG} 如果在 Profile 页显示"已创建 N 个作品，升级后可批量导出"，则付费转化会提升`,
      mechanism: '利用用户已沉没成本作为升级动机',
      expectedImpact: '+0.5pp 付费转化',
      status: 'BACKLOG' as const,
      iceImpact: 6,
      iceConfidence: 6,
      iceEase: 7,
      iceScore: (6 * 6 * 7) / 10,
    },
  ]

  const createdHypotheses: { id: string; krId: string; statement: string }[] = []
  for (const h of hypotheses) {
    const { result, learning, parentStatement: _p, ...hypData } = h as any
    const created = await prisma.hypothesis.create({
      data: {
        ...hypData,
        ownerId: admin.id,
      },
    })
    createdHypotheses.push({
      id: created.id,
      krId: h.krId,
      statement: h.statement,
    })

    if (result) {
      await prisma.hypothesisResult.create({
        data: {
          hypothesisId: created.id,
          ...result,
        },
      })
    }
    if (learning) {
      await prisma.learning.create({
        data: {
          source: 'AI_GENERATED',
          hypothesisId: created.id,
          title: h.statement.slice(0, 50).replace(DEMO_TAG, '').trim(),
          content: learning.text,
          createdById: admin.id,
        },
      })
    }
  }
  console.log(`[seed] ${createdHypotheses.length} hypotheses + results + learnings 创建完毕`)

  // 5. 给一个 hypothesis 加 A/B Variants（有显著 WIN）
  const winnerHypo = createdHypotheses.find((h) =>
    h.statement.includes('视频引导'),
  )
  if (winnerHypo) {
    await prisma.hypothesisVariant.create({
      data: {
        hypothesisId: winnerHypo.id,
        name: 'A - 静态 hero 图（对照）',
        description: '保持原版静态图不变',
        type: 'CONTROL',
        sampleSize: 5000,
        conversionCount: 1000, // 20%
        conversionRate: 0.2,
        isSignificant: false,
        isWinner: false,
      },
    })
    await prisma.hypothesisVariant.create({
      data: {
        hypothesisId: winnerHypo.id,
        name: 'B - 15 秒引导视频',
        description: '在 hero 位换成 15s MP4 自动循环',
        type: 'TREATMENT',
        sampleSize: 5000,
        conversionCount: 1315, // 26.3%
        conversionRate: 0.263,
        pValue: 0.0002,
        confidenceInterval95Low: 0.048,
        confidenceInterval95High: 0.078,
        isSignificant: true,
        isWinner: true,
      },
    })
    console.log('[seed] A/B variants (hero video) 创建')
  }

  // 6. 给推送通知那次失败的加一组 non-significant variants
  const pushHypo = createdHypotheses.find((h) => h.statement.includes('晚上 8 点'))
  if (pushHypo) {
    await prisma.hypothesisVariant.create({
      data: {
        hypothesisId: pushHypo.id,
        name: 'A - 不发 push（对照）',
        type: 'CONTROL',
        sampleSize: 3000,
        conversionCount: 249, // 8.3%
        conversionRate: 0.083,
        isSignificant: false,
        isWinner: false,
      },
    })
    await prisma.hypothesisVariant.create({
      data: {
        hypothesisId: pushHypo.id,
        name: 'B - 注册当天 20:00 发 push',
        type: 'TREATMENT',
        sampleSize: 3000,
        conversionCount: 240, // 8.0%
        conversionRate: 0.08,
        pValue: 0.64,
        confidenceInterval95Low: -0.018,
        confidenceInterval95High: 0.012,
        isSignificant: false,
        isWinner: false,
      },
    })
    console.log('[seed] A/B variants (push 8pm) 创建（非显著）')
  }

  // 7. 手工拼一份 CopilotDigest，让 Dashboard 面板有东西看
  //    包含三类在 PRD 选项 C 截图里承诺的内容：
  //      - dead_direction (推送通知 3 次失败)
  //      - winning_streak (视频引导胜出 + 建议追加变体)
  //      - stagnant_kr (付费 KR 10 天无 running)
  //    加一条 pattern (跨假设规律) + learnings 列表

  const digestPayload = {
    alerts: [
      {
        type: 'dead_direction',
        krId: kr2.id,
        krName: '新用户 7 日留存率',
        message:
          '"推送通知"方向连续 3 次实验全部失败（最近 28 天）。所有 variants 均无正向 impact，综合 p-value > 0.5。建议 pivot 到 in-app 任务型引导。',
        severity: 'critical',
        evidenceHypothesisIds: createdHypotheses
          .filter((h) => h.statement.includes('push'))
          .map((h) => h.id),
        squadId: admin.squadId ?? null,
      },
      {
        type: 'winning_streak',
        krId: kr1.id,
        krName: '新用户首日留存率',
        message:
          '"视频引导"方向验证有效：上一次实验首日留存从 20% → 26.3%（显著 p<0.001）。建议追加 2-3 个视频方向变体（Home hero 视频、Profile 介绍视频等）。',
        severity: 'info',
        evidenceHypothesisIds: createdHypotheses
          .filter((h) => h.statement.includes('视频'))
          .map((h) => h.id),
        squadId: admin.squadId ?? null,
      },
      {
        type: 'stagnant_kr',
        krId: kr3.id,
        krName: '新用户首周付费转化率',
        message:
          'KR "首周付费转化率" 过去 10 天没有新 RUNNING hypothesis，距离目标仍差 1.7pp。Backlog 里有 3 个假设等待开始——要放弃这个 KR 还是让它重新动起来？',
        severity: 'warning',
        evidenceHypothesisIds: [],
        squadId: admin.squadId ?? null,
      },
    ],
    patterns: [
      {
        title: '外部召回 vs in-app 引导',
        description:
          '在本项目观察到一个明确模式：**所有依赖外部打扰用户的尝试（push 通知、邮件召回）都失败了**，而**所有在用户当下 session 内的 in-app 引导（视频、任务流）都起作用**。结论：新用户还没形成习惯时，外部通知是打扰而非唤醒；应该把所有留存努力集中在"用户打开 app 的那几分钟里"。',
        evidenceHypothesisIds: createdHypotheses
          .filter(
            (h) =>
              h.statement.includes('push') || h.statement.includes('视频'),
          )
          .map((h) => h.id),
        recommendation: 'Push 预算砍掉 70%，把资源放到 in-app 新手任务流上',
        confidence: 'high',
        relatedSquadIds: admin.squadId ? [admin.squadId] : [],
      },
    ],
    nextHypothesisSuggestions: [
      {
        krId: kr1.id,
        statement: '如果在 Profile 页加"30 秒创作者故事"视频，则首日留存 +2pp',
        mechanism: '延续视频引导胜出方向，把视频覆盖到第二个触点',
        expectedImpact: '+2pp 首日留存',
        expectedImpactValue: 2,
        expectedImpactUnit: 'pp',
        targetSquadId: admin.squadId ?? null,
      },
      {
        krId: kr2.id,
        statement: '如果给新用户设计一个 "5 分钟出第一个作品" 的任务流，则 7 日留存 +3pp',
        mechanism: '替代失败的 push 方向，in-app 任务流利用沉没成本留住用户',
        expectedImpact: '+3pp 7 日留存',
        expectedImpactValue: 3,
        expectedImpactUnit: 'pp',
        targetSquadId: admin.squadId ?? null,
      },
      {
        krId: kr3.id,
        statement: '如果在 aha moment 瞬间弹出"解锁高级功能"升级提示，则付费转化 +1pp',
        mechanism: '用户最认可产品价值的时刻 pitch 转化最高',
        expectedImpact: '+1pp 付费转化',
        expectedImpactValue: 1,
        expectedImpactUnit: 'pp',
        targetSquadId: admin.squadId ?? null,
      },
    ],
    learnings: createdHypotheses
      .filter((h) => h.statement.includes('视频引导') || h.statement.includes('推送'))
      .slice(0, 3)
      .map((h) => ({
        hypothesisId: h.id,
        text:
          h.statement.includes('视频')
            ? '15 秒视频让首日留存 +6.3pp，超过预期。核心在于 3 秒内传递产品价值。'
            : 'Push 方向在本项目彻底失败，建议彻底放弃。',
        squadId: admin.squadId ?? null,
      })),
  }

  await prisma.copilotDigest.create({
    data: {
      scope: `project:demo-${project.id}`,
      triggerType: 'manual',
      payload: digestPayload as any,
    },
  })

  // 同时写一条 global scope 的 digest（ADMIN 全局视图用）
  await prisma.copilotDigest.create({
    data: {
      scope: 'global',
      triggerType: 'scheduled_daily',
      payload: digestPayload as any,
    },
  })
  console.log('[seed] CopilotDigest (project + global) 创建完毕')

  console.log('\n✅ Learning Copilot demo 种子完成')
  console.log(`  Objective: ${objective.name}`)
  console.log(`    KR1 (on_track): ${kr1.name} 20→26/30%`)
  console.log(`    KR2 (behind):    ${kr2.name} 8→9.5/15%`)
  console.log(`    KR3 (stagnant):  ${kr3.name} 1.2→1.3/3%`)
  console.log(`  Hypotheses: ${createdHypotheses.length}`)
  console.log(`  Variants: 2 组（一组显著、一组非显著）`)
  console.log(`  Learnings: 7 条 AI_GENERATED`)
  console.log(`  CopilotDigest: 2 条（project + global），含 3 alerts + 1 pattern + 3 suggestions`)
  console.log('\n打开 http://localhost:5173/dashboard 即可看到全部数据')
}

main()
  .catch((err) => {
    console.error('[seed] 失败：', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
