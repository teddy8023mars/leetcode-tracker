import { z } from 'zod';

export const CurriculumDaySchema = z.object({
  index: z.number().int().min(0).max(59),
  key: z.string().min(1),
  week: z.number().int().min(1).max(12),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  topicEn: z.string().min(1),
  topicZh: z.string().min(1),
  lessonEn: z.string().min(1),
  lessonZh: z.string().min(1),
  patternEn: z.string().min(1),
  patternZh: z.string().min(1),
  mistakeEn: z.string().min(1),
  mistakeZh: z.string().min(1),
  primarySlug: z.string().regex(/^[a-z0-9-]+$/),
  fallbackSlugs: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  warmupSlug: z.string().regex(/^[a-z0-9-]+$/),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  hintsZh: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  career: z.object({
    type: z.enum(['gcp', 'system_design', 'behavioral']),
    titleEn: z.string().min(1),
    titleZh: z.string().min(1),
    bodyEn: z.string().min(1),
    bodyZh: z.string().min(1),
  }),
});

export type CurriculumDay = z.infer<typeof CurriculumDaySchema>;

type ProblemPlan = {
  slug: string;
  titleEn: string;
  titleZh: string;
  focusEn: string;
  focusZh: string;
};

type CareerPlan = Omit<CurriculumDay['career'], 'bodyEn' | 'bodyZh'> & {
  bodyEn: string;
  bodyZh: string;
};

type WeekPlan = {
  topicEn: string;
  topicZh: string;
  patternEn: string;
  patternZh: string;
  mistakeEn: string;
  mistakeZh: string;
  warmupSlug: string;
  problems: [ProblemPlan, ProblemPlan, ProblemPlan, ProblemPlan, ProblemPlan];
  career: [CareerPlan, CareerPlan, CareerPlan, CareerPlan, CareerPlan];
};

const gcp = (titleEn: string, titleZh: string, bodyEn: string, bodyZh: string): CareerPlan => ({
  type: 'gcp', titleEn, titleZh, bodyEn, bodyZh,
});
const design = (titleEn: string, titleZh: string, bodyEn: string, bodyZh: string): CareerPlan => ({
  type: 'system_design', titleEn, titleZh, bodyEn, bodyZh,
});
const behavioral = (titleEn: string, titleZh: string, bodyEn: string, bodyZh: string): CareerPlan => ({
  type: 'behavioral', titleEn, titleZh, bodyEn, bodyZh,
});
const problem = (slug: string, titleEn: string, titleZh: string, focusEn: string, focusZh: string): ProblemPlan => ({
  slug, titleEn, titleZh, focusEn, focusZh,
});

const WEEKS: readonly WeekPlan[] = [
  {
    topicEn: 'Arrays & hashing', topicZh: '数组与哈希',
    patternEn: 'Trade memory for constant-time lookup; define exactly what each key means.',
    patternZh: '用空间换常数时间查找，并先定义哈希表中每个 key 的准确含义。',
    mistakeEn: 'Updating the map before checking can accidentally reuse the current element.',
    mistakeZh: '先更新再查询可能会错误地重复使用当前元素。', warmupSlug: 'two-sum',
    problems: [
      problem('two-sum', 'Two Sum', '两数之和', 'complement lookup', '补数查找'),
      problem('contains-duplicate', 'Contains Duplicate', '存在重复元素', 'set membership', '集合判重'),
      problem('valid-anagram', 'Valid Anagram', '有效的字母异位词', 'frequency counting', '频次统计'),
      problem('group-anagrams', 'Group Anagrams', '字母异位词分组', 'canonical keys', '规范化 key'),
      problem('top-k-frequent-elements', 'Top K Frequent Elements', '前 K 个高频元素', 'count then rank', '统计后排序'),
    ],
    career: [
      gcp('PDE exam map', 'PDE 考试地图', 'Write the four exam domains and one project example for each.', '写下四个考试领域，并为每个领域关联一个你的项目案例。'),
      gcp('Storage choices', '存储选型', 'Compare Cloud Storage, BigQuery, Cloud SQL, and Spanner by access pattern.', '按访问模式对比 Cloud Storage、BigQuery、Cloud SQL 与 Spanner。'),
      gcp('IAM foundations', 'IAM 基础', 'Explain least privilege, service accounts, and resource hierarchy in your own words.', '用自己的话解释最小权限、服务账号与资源层级。'),
      design('Design an event counter', '设计事件计数器', 'Sketch ingestion, deduplication, storage, and a query path for daily event counts.', '画出每日事件计数系统的采集、去重、存储与查询路径。'),
      behavioral('Why Google, why now?', '为什么是 Google、为什么是现在', 'Draft a 90-second answer grounded in data-platform impact rather than brand prestige.', '写一个 90 秒回答，重点放在数据平台影响力，而不是品牌光环。'),
    ],
  },
  {
    topicEn: 'Two pointers', topicZh: '双指针',
    patternEn: 'Use two indices when a monotonic relationship lets one move discard possibilities.',
    patternZh: '当移动某一端可以单调排除候选时，使用两个下标缩小范围。',
    mistakeEn: 'Moving both pointers without proving which side is safe can skip the answer.',
    mistakeZh: '没有证明就同时移动两端，可能直接跳过答案。', warmupSlug: 'valid-palindrome',
    problems: [
      problem('valid-palindrome', 'Valid Palindrome', '验证回文串', 'inward scan', '向内扫描'),
      problem('two-sum-ii-input-array-is-sorted', 'Two Sum II', '两数之和 II', 'sorted movement', '有序移动'),
      problem('3sum', '3Sum', '三数之和', 'sort and reduce', '排序降维'),
      problem('container-with-most-water', 'Container With Most Water', '盛最多水的容器', 'discard the shorter side', '淘汰短板'),
      problem('trapping-rain-water', 'Trapping Rain Water', '接雨水', 'bounded water levels', '边界水位'),
    ],
    career: [
      gcp('Batch ingestion', '批处理采集', 'Choose between Storage Transfer, BigQuery load jobs, and Dataflow for three batch scenarios.', '为三个批处理场景选择 Storage Transfer、BigQuery load job 或 Dataflow。'),
      gcp('Streaming ingestion', '流式采集', 'Trace ordering, retries, and dead-letter handling through Pub/Sub.', '梳理 Pub/Sub 中的顺序、重试与死信处理。'),
      gcp('Dataflow model', 'Dataflow 模型', 'Explain event time, processing time, windows, watermarks, and triggers.', '解释事件时间、处理时间、窗口、水位线和触发器。'),
      design('Design clickstream ingestion', '设计点击流采集', 'Handle burst traffic, late events, replay, and schema evolution.', '处理突发流量、迟到事件、重放与 schema 演进。'),
      behavioral('A difficult trade-off', '一次艰难取舍', 'Prepare a STAR story where you chose reliability, speed, or scope and measured the result.', '准备一个 STAR 故事：你如何在可靠性、速度或范围之间取舍，并量化结果。'),
    ],
  },
  {
    topicEn: 'Sliding window', topicZh: '滑动窗口',
    patternEn: 'Maintain an invariant for a contiguous range and move the left edge only to restore it.',
    patternZh: '维护连续区间的不变量，只在不变量被破坏时移动左边界。',
    mistakeEn: 'Recomputing the whole window hides the intended linear-time solution.',
    mistakeZh: '每次重算整个窗口会失去线性时间的优势。', warmupSlug: 'best-time-to-buy-and-sell-stock',
    problems: [
      problem('best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', '买卖股票的最佳时机', 'running minimum', '维护最小值'),
      problem('longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', '无重复字符的最长子串', 'unique-window invariant', '无重复窗口'),
      problem('longest-repeating-character-replacement', 'Longest Repeating Character Replacement', '替换后的最长重复字符', 'window repair budget', '窗口修复预算'),
      problem('permutation-in-string', 'Permutation in String', '字符串的排列', 'fixed-size counts', '固定窗口计数'),
      problem('minimum-window-substring', 'Minimum Window Substring', '最小覆盖子串', 'formed requirements', '满足需求计数'),
    ],
    career: [
      gcp('BigQuery partitioning', 'BigQuery 分区', 'Choose ingestion-time, time-unit, or integer-range partitioning and explain pruning.', '选择摄取时间、时间列或整数范围分区，并解释分区裁剪。'),
      gcp('Clustering and cost', '聚簇与成本', 'Explain when clustering reduces scanned bytes and how dry runs control cost.', '解释聚簇何时减少扫描量，以及 dry run 如何控制成本。'),
      gcp('BigQuery performance', 'BigQuery 性能', 'Diagnose skew, excessive shuffles, SELECT *, and repeated transformations.', '诊断数据倾斜、过多 shuffle、SELECT * 与重复转换。'),
      design('Design a metrics dashboard', '设计指标看板', 'Define freshness, aggregation levels, backfills, and query-serving strategy.', '定义新鲜度、聚合层级、回填方式与查询服务策略。'),
      behavioral('A production incident', '一次生产事故', 'Prepare a blameless incident story with detection, mitigation, root cause, and prevention.', '准备一个无责事故故事，包含发现、止损、根因与预防。'),
    ],
  },
  {
    topicEn: 'Stacks', topicZh: '栈',
    patternEn: 'A stack preserves unresolved work; a monotonic stack keeps only candidates that can still matter.',
    patternZh: '栈保存尚未解决的状态；单调栈只保留未来仍可能有用的候选。',
    mistakeEn: 'Storing values when later logic needs indices loses distance information.',
    mistakeZh: '后续需要距离时只存值不存下标，会丢失关键信息。', warmupSlug: 'valid-parentheses',
    problems: [
      problem('valid-parentheses', 'Valid Parentheses', '有效的括号', 'matching delimiters', '括号配对'),
      problem('min-stack', 'Min Stack', '最小栈', 'paired state', '同步状态'),
      problem('evaluate-reverse-polish-notation', 'Evaluate Reverse Polish Notation', '逆波兰表达式求值', 'operand stack', '操作数栈'),
      problem('daily-temperatures', 'Daily Temperatures', '每日温度', 'monotonic indices', '单调下标'),
      problem('largest-rectangle-in-histogram', 'Largest Rectangle in Histogram', '柱状图中最大的矩形', 'flush monotonic bars', '弹出单调柱'),
    ],
    career: [
      gcp('Dataproc versus Dataflow', 'Dataproc 与 Dataflow', 'Choose managed Beam or managed Spark/Hadoop based on code, operations, and latency.', '按代码生态、运维负担和延迟选择 Beam 或 Spark/Hadoop。'),
      gcp('Composer orchestration', 'Composer 编排', 'Separate orchestration from transformation and define idempotent retries.', '区分编排与转换，并定义幂等重试。'),
      gcp('Dataform transformations', 'Dataform 转换', 'Map assertions, dependencies, incremental tables, and release workflows.', '梳理断言、依赖、增量表和发布工作流。'),
      design('Design a workflow scheduler', '设计工作流调度器', 'Cover DAG state, retries, idempotency, backfills, and worker leases.', '覆盖 DAG 状态、重试、幂等、回填与 worker 租约。'),
      behavioral('Influence without authority', '无职权影响他人', 'Draft a STAR story showing how evidence and empathy changed a cross-team decision.', '准备一个 STAR 故事：你如何用证据与同理心改变跨团队决策。'),
    ],
  },
  {
    topicEn: 'Binary search', topicZh: '二分查找',
    patternEn: 'Search a monotonic answer space with an explicit invariant and consistent boundaries.',
    patternZh: '在单调答案空间中搜索，明确区间不变量并统一边界语义。',
    mistakeEn: 'Mixing closed and half-open intervals creates infinite loops or missed endpoints.',
    mistakeZh: '混用闭区间与半开区间会导致死循环或漏掉端点。', warmupSlug: 'binary-search',
    problems: [
      problem('binary-search', 'Binary Search', '二分查找', 'closed interval', '闭区间'),
      problem('search-a-2d-matrix', 'Search a 2D Matrix', '搜索二维矩阵', 'flattened order', '一维映射'),
      problem('koko-eating-bananas', 'Koko Eating Bananas', '爱吃香蕉的珂珂', 'binary search on answer', '答案二分'),
      problem('find-minimum-in-rotated-sorted-array', 'Find Minimum in Rotated Sorted Array', '寻找旋转排序数组中的最小值', 'sorted half invariant', '有序半区'),
      problem('search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', '搜索旋转排序数组', 'choose the sorted side', '选择有序侧'),
    ],
    career: [
      gcp('Relational databases', '关系数据库', 'Compare Cloud SQL and AlloyDB for compatibility, scale, and operations.', '按兼容性、规模与运维对比 Cloud SQL 和 AlloyDB。'),
      gcp('Spanner decisions', 'Spanner 决策', 'Explain when global consistency and horizontal scale justify Spanner.', '解释何时全球一致性与水平扩展值得使用 Spanner。'),
      gcp('NoSQL decisions', 'NoSQL 决策', 'Compare Bigtable and Firestore by key design, access pattern, and transaction need.', '按 key 设计、访问模式与事务需求对比 Bigtable 和 Firestore。'),
      design('Design a feature store', '设计特征存储', 'Separate offline and online stores while preserving point-in-time correctness.', '分离离线与在线存储，同时保证时间点正确性。'),
      behavioral('Handling ambiguity', '处理模糊需求', 'Prepare a story where you created clarity through experiments, metrics, or a written decision.', '准备一个故事：你如何通过实验、指标或书面决策把模糊变清晰。'),
    ],
  },
  {
    topicEn: 'Linked lists', topicZh: '链表',
    patternEn: 'Use sentinel nodes and pointer invariants to make head and middle operations uniform.',
    patternZh: '使用哨兵节点和指针不变量，让头部与中间操作统一。',
    mistakeEn: 'Changing a pointer before saving its successor can lose the rest of the list.',
    mistakeZh: '修改指针前没有保存后继节点，会丢失剩余链表。', warmupSlug: 'reverse-linked-list',
    problems: [
      problem('reverse-linked-list', 'Reverse Linked List', '反转链表', 'save then reverse', '保存后反转'),
      problem('merge-two-sorted-lists', 'Merge Two Sorted Lists', '合并两个有序链表', 'sentinel merge', '哨兵合并'),
      problem('linked-list-cycle', 'Linked List Cycle', '环形链表', 'fast and slow pointers', '快慢指针'),
      problem('reorder-list', 'Reorder List', '重排链表', 'split reverse merge', '切分反转合并'),
      problem('remove-nth-node-from-end-of-list', 'Remove Nth Node From End of List', '删除链表的倒数第 N 个结点', 'fixed pointer gap', '固定指针距离'),
    ],
    career: [
      gcp('Data governance', '数据治理', 'Map Dataplex, Data Catalog capabilities, lineage, and ownership.', '梳理 Dataplex、数据目录能力、血缘与所有权。'),
      gcp('Sensitive data', '敏感数据', 'Design discovery, classification, masking, and access with Sensitive Data Protection.', '用 Sensitive Data Protection 设计发现、分类、脱敏与访问。'),
      gcp('Encryption choices', '加密选择', 'Compare Google-managed, customer-managed, and customer-supplied keys.', '对比 Google 托管、客户托管与客户提供的密钥。'),
      design('Design data lineage', '设计数据血缘', 'Capture job, dataset, column, and ownership relationships with incremental updates.', '增量采集任务、数据集、字段与所有权关系。'),
      behavioral('Giving difficult feedback', '给出困难反馈', 'Prepare a respectful story with observable behavior, impact, and follow-up.', '准备一个尊重他人的反馈故事，包含可观察行为、影响与跟进。'),
    ],
  },
  {
    topicEn: 'Trees', topicZh: '树',
    patternEn: 'Choose DFS when child results combine upward and BFS when level order matters.',
    patternZh: '子树结果需要向上合并时用 DFS，层级顺序重要时用 BFS。',
    mistakeEn: 'Recursive code without a clear return contract mixes traversal state and subtree answers.',
    mistakeZh: '递归函数没有明确返回契约，会混淆遍历状态与子树答案。', warmupSlug: 'maximum-depth-of-binary-tree',
    problems: [
      problem('maximum-depth-of-binary-tree', 'Maximum Depth of Binary Tree', '二叉树的最大深度', 'subtree return value', '子树返回值'),
      problem('invert-binary-tree', 'Invert Binary Tree', '翻转二叉树', 'recursive transformation', '递归变换'),
      problem('diameter-of-binary-tree', 'Diameter of Binary Tree', '二叉树的直径', 'local plus global answer', '局部与全局答案'),
      problem('binary-tree-level-order-traversal', 'Binary Tree Level Order Traversal', '二叉树的层序遍历', 'queue by level', '按层队列'),
      problem('validate-binary-search-tree', 'Validate Binary Search Tree', '验证二叉搜索树', 'value bounds', '取值边界'),
    ],
    career: [
      gcp('Reliability objectives', '可靠性目标', 'Define freshness, completeness, correctness, and availability SLOs for a pipeline.', '为数据管道定义新鲜度、完整性、正确性与可用性 SLO。'),
      gcp('Monitoring pipelines', '监控数据管道', 'Choose metrics, logs, traces, and alert thresholds that lead to action.', '选择能指导行动的指标、日志、追踪与告警阈值。'),
      gcp('Disaster recovery', '灾难恢复', 'Tie RPO and RTO to backup, replication, and replay choices.', '把 RPO、RTO 与备份、复制、重放方案关联起来。'),
      design('Design a data quality platform', '设计数据质量平台', 'Cover rules, sampling, ownership, alert routing, and historical scorecards.', '覆盖规则、采样、所有权、告警路由与历史质量看板。'),
      behavioral('Learning from failure', '从失败中学习', 'Prepare a story with personal ownership, changed behavior, and lasting prevention.', '准备一个体现个人担当、行为改变与长期预防的失败故事。'),
    ],
  },
  {
    topicEn: 'Heaps & intervals', topicZh: '堆与区间',
    patternEn: 'Use a heap for the next best dynamic candidate and sort intervals to expose overlap.',
    patternZh: '用堆维护动态最优候选；先排序区间以显露重叠关系。',
    mistakeEn: 'Keeping every candidate in the heap can turn an intended O(n log k) solution into O(n log n).',
    mistakeZh: '把所有候选都留在堆中，会把 O(n log k) 退化成 O(n log n)。', warmupSlug: 'last-stone-weight',
    problems: [
      problem('last-stone-weight', 'Last Stone Weight', '最后一块石头的重量', 'max heap simulation', '最大堆模拟'),
      problem('kth-largest-element-in-an-array', 'Kth Largest Element in an Array', '数组中的第 K 个最大元素', 'bounded heap', '固定大小堆'),
      problem('merge-intervals', 'Merge Intervals', '合并区间', 'sorted overlap', '排序后合并'),
      problem('insert-interval', 'Insert Interval', '插入区间', 'three interval regions', '三个区间区域'),
      problem('meeting-rooms-ii', 'Meeting Rooms II', '会议室 II', 'active end times', '活动结束时间'),
    ],
    career: [
      gcp('Migration planning', '迁移规划', 'Inventory dependencies, validate parity, plan dual runs, and define rollback.', '盘点依赖、验证一致性、规划双跑并定义回滚。'),
      gcp('Cost optimization', '成本优化', 'Separate storage, compute, network, and operational costs before tuning.', '优化前先拆分存储、计算、网络与运维成本。'),
      gcp('Autoscaling trade-offs', '自动扩缩容取舍', 'Explain how backlog, worker utilization, and startup time affect scaling.', '解释积压、worker 利用率与启动时间如何影响扩缩容。'),
      design('Design a backfill platform', '设计回填平台', 'Support ranges, throttling, idempotency, lineage, and safe production coexistence.', '支持范围、限流、幂等、血缘，以及与生产任务安全共存。'),
      behavioral('Prioritizing under pressure', '压力下排优先级', 'Prepare a story that makes the decision criteria and rejected work explicit.', '准备一个故事，明确决策标准以及被放弃的工作。'),
    ],
  },
  {
    topicEn: 'Graphs', topicZh: '图',
    patternEn: 'Make nodes, edges, visited state, and traversal direction explicit before coding.',
    patternZh: '编码前先明确节点、边、访问状态与遍历方向。',
    mistakeEn: 'Marking visited after dequeue can enqueue the same node many times.',
    mistakeZh: '出队后才标记 visited，会让同一节点重复入队。', warmupSlug: 'number-of-islands',
    problems: [
      problem('number-of-islands', 'Number of Islands', '岛屿数量', 'grid traversal', '网格遍历'),
      problem('clone-graph', 'Clone Graph', '克隆图', 'old-to-new map', '新旧节点映射'),
      problem('rotting-oranges', 'Rotting Oranges', '腐烂的橘子', 'multi-source BFS', '多源 BFS'),
      problem('course-schedule', 'Course Schedule', '课程表', 'topological cycle detection', '拓扑判环'),
      problem('network-delay-time', 'Network Delay Time', '网络延迟时间', 'shortest paths', '最短路径'),
    ],
    career: [
      gcp('Pub/Sub delivery', 'Pub/Sub 投递', 'Reason about at-least-once delivery, ordering keys, retries, and idempotent consumers.', '分析至少一次投递、顺序 key、重试与幂等消费者。'),
      gcp('Streaming correctness', '流处理正确性', 'Explain deduplication IDs, state, timers, and late-data policy.', '解释去重 ID、状态、定时器与迟到数据策略。'),
      gcp('Change data capture', '变更数据捕获', 'Map Database Migration Service, Datastream, landing storage, and merge logic.', '梳理 Database Migration Service、Datastream、落地存储与 merge 逻辑。'),
      design('Design CDC into a warehouse', '设计 CDC 入仓', 'Handle snapshots, ordering, deletes, schema changes, and replay.', '处理快照、顺序、删除、schema 变化与重放。'),
      behavioral('Cross-team conflict', '跨团队冲突', 'Prepare a story that distinguishes people, interests, constraints, and the shared outcome.', '准备一个区分人员、利益、约束与共同结果的冲突故事。'),
    ],
  },
  {
    topicEn: 'Backtracking', topicZh: '回溯',
    patternEn: 'Define choice, constraint, goal, and undo steps; mutate one path and restore it exactly.',
    patternZh: '定义选择、约束、终止条件与撤销步骤；只维护一条路径并准确恢复。',
    mistakeEn: 'Appending the same mutable path object stores later mutations instead of a snapshot.',
    mistakeZh: '直接保存可变 path 对象，会记录后续修改而不是当前快照。', warmupSlug: 'subsets',
    problems: [
      problem('subsets', 'Subsets', '子集', 'include or exclude', '选或不选'),
      problem('combination-sum', 'Combination Sum', '组合总和', 'reusable choices', '可重复选择'),
      problem('permutations', 'Permutations', '全排列', 'used-state choices', '已使用状态'),
      problem('word-search', 'Word Search', '单词搜索', 'grid path undo', '网格路径撤销'),
      problem('palindrome-partitioning', 'Palindrome Partitioning', '分割回文串', 'partition endpoints', '分割端点'),
    ],
    career: [
      gcp('ML data foundations', '机器学习数据基础', 'Separate training, validation, serving, and monitoring data responsibilities.', '区分训练、验证、服务与监控数据的职责。'),
      gcp('Vertex AI pipelines', 'Vertex AI 管道', 'Map reusable components, artifact lineage, metadata, and scheduled runs.', '梳理可复用组件、产物血缘、元数据与定时运行。'),
      gcp('Feature consistency', '特征一致性', 'Explain training-serving skew and point-in-time correct joins.', '解释训练服务偏差与时间点正确的 join。'),
      design('Design an experimentation platform', '设计实验平台', 'Cover assignment, exposure logs, metrics, guardrails, and reproducibility.', '覆盖分流、曝光日志、指标、护栏与可复现性。'),
      behavioral('Mentoring someone', '辅导他人成长', 'Prepare a story with the learner’s goal, your intervention, feedback loop, and outcome.', '准备一个包含对方目标、你的介入、反馈循环与结果的辅导故事。'),
    ],
  },
  {
    topicEn: 'Dynamic programming', topicZh: '动态规划',
    patternEn: 'Define state in one sentence, write the transition, identify base cases, then choose traversal order.',
    patternZh: '用一句话定义状态，再写转移、初始条件，最后决定遍历顺序。',
    mistakeEn: 'Starting from code before defining state usually creates overlapping or missing cases.',
    mistakeZh: '没有先定义状态就写代码，通常会重复或漏掉情况。', warmupSlug: 'climbing-stairs',
    problems: [
      problem('climbing-stairs', 'Climbing Stairs', '爬楼梯', 'one-dimensional recurrence', '一维递推'),
      problem('house-robber', 'House Robber', '打家劫舍', 'take or skip', '选或不选'),
      problem('coin-change', 'Coin Change', '零钱兑换', 'minimum over choices', '选择中的最小值'),
      problem('longest-increasing-subsequence', 'Longest Increasing Subsequence', '最长递增子序列', 'best ending here', '以此结尾的最优值'),
      problem('longest-common-subsequence', 'Longest Common Subsequence', '最长公共子序列', 'two-sequence state', '双序列状态'),
    ],
    career: [
      gcp('Exam architecture cases', '考试架构题', 'For each case, identify requirements, constraints, managed service, and rejection reasons.', '对每个案例识别需求、约束、托管服务与排除其他选项的理由。'),
      gcp('Security review', '安全复盘', 'Review IAM, VPC Service Controls, audit logs, encryption, and secrets together.', '串联复习 IAM、VPC Service Controls、审计日志、加密与密钥。'),
      gcp('Operations review', '运维复盘', 'Review monitoring, retries, DR, cost, quotas, and support boundaries.', '串联复习监控、重试、灾备、成本、配额与支持边界。'),
      design('Design a multi-tenant data platform', '设计多租户数据平台', 'Cover isolation, quotas, metadata, cost attribution, and noisy-neighbor control.', '覆盖隔离、配额、元数据、成本归属与噪声邻居控制。'),
      behavioral('Leadership summary', '领导力总结', 'Select three stories that together show ownership, collaboration, and technical judgment.', '挑选三个故事，合起来体现担当、协作与技术判断。'),
    ],
  },
  {
    topicEn: 'Interview synthesis', topicZh: '面试综合训练',
    patternEn: 'Clarify, state the brute force, derive the invariant, code in small steps, and test aloud.',
    patternZh: '先澄清，再说暴力解，推导不变量，小步编码，并边讲边测。',
    mistakeEn: 'Silently jumping to code hides reasoning and makes recovery harder when stuck.',
    mistakeZh: '沉默地直接写代码会隐藏推理，也让卡住时更难恢复。', warmupSlug: 'two-sum',
    problems: [
      problem('product-of-array-except-self', 'Product of Array Except Self', '除自身以外数组的乘积', 'prefix and suffix', '前后缀'),
      problem('lowest-common-ancestor-of-a-binary-search-tree', 'Lowest Common Ancestor of a BST', '二叉搜索树的最近公共祖先', 'ordered branching', '有序分支'),
      problem('serialize-and-deserialize-binary-tree', 'Serialize and Deserialize Binary Tree', '二叉树的序列化与反序列化', 'stable encoding contract', '稳定编码契约'),
      problem('word-ladder', 'Word Ladder', '单词接龙', 'implicit graph BFS', '隐式图 BFS'),
      problem('edit-distance', 'Edit Distance', '编辑距离', 'operation-based DP', '操作型 DP'),
    ],
    career: [
      gcp('PDE weak-area drill', 'PDE 薄弱点训练', 'Use practice results to choose one weak domain and write a one-page correction note.', '根据练习结果选择一个薄弱领域，写一页纠错笔记。'),
      gcp('Architecture explanation', '架构表达', 'Explain one GCP data architecture in two minutes with requirements before services.', '用两分钟解释一个 GCP 数据架构，先讲需求再讲服务。'),
      gcp('Final exam checklist', '考前检查表', 'Confirm exam logistics, eliminate-and-justify technique, and a recertification note.', '确认考试安排、排除并说明理由的答题法，以及续证提醒。'),
      design('Design Google-scale payments analytics', '设计大规模支付分析平台', 'Cover correctness, reconciliation, privacy, late data, serving, and auditability.', '覆盖正确性、对账、隐私、迟到数据、查询服务与可审计性。'),
      behavioral('Full mock interview retrospective', '完整模拟面试复盘', 'Record evidence for communication, correctness, speed, and one next improvement.', '记录沟通、正确性、速度方面的证据，并确定一个下一步改进点。'),
    ],
  },
];

const rawDays = WEEKS.flatMap((week, weekIndex) =>
  week.problems.map((p, dayIndex) => {
    const next = week.problems[(dayIndex + 1) % week.problems.length];
    const nextTwo = week.problems[(dayIndex + 2) % week.problems.length];
    const index = weekIndex * 5 + dayIndex;
    return {
      index,
      key: `week-${weekIndex + 1}-day-${dayIndex + 1}`,
      week: weekIndex + 1,
      titleEn: p.titleEn,
      titleZh: p.titleZh,
      topicEn: week.topicEn,
      topicZh: week.topicZh,
      lessonEn: `Today, practise ${p.focusEn}. ${week.patternEn}`,
      lessonZh: `今天练习${p.focusZh}。${week.patternZh}`,
      patternEn: week.patternEn,
      patternZh: week.patternZh,
      mistakeEn: week.mistakeEn,
      mistakeZh: week.mistakeZh,
      primarySlug: p.slug,
      fallbackSlugs: [next.slug, nextTwo.slug],
      warmupSlug: week.warmupSlug,
      hints: [
        `State the invariant for ${p.focusEn} before choosing a data structure.`,
        `Use this pattern: ${week.patternEn}`,
        `Walk through the smallest edge case and check every state update.`,
      ] as [string, string, string],
      hintsZh: [
        `先写出${p.focusZh}的不变量，再选择数据结构。`,
        `使用这个模式：${week.patternZh}`,
        `用最小边界用例逐步检查每一次状态更新。`,
      ] as [string, string, string],
      career: week.career[dayIndex],
    };
  }),
);

export const CURRICULUM: readonly CurriculumDay[] = Object.freeze(
  z.array(CurriculumDaySchema).length(60).parse(rawDays),
);

export function getCurriculumDay(index: number): CurriculumDay {
  const normalized = ((index % CURRICULUM.length) + CURRICULUM.length) % CURRICULUM.length;
  return CURRICULUM[normalized];
}
