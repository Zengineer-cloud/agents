# Warn in tokens, not percent of window

Long context quality falls as a gradual slope, and the slope is best described in absolute tokens, not in percent of the window. For Claude Code on a 1M window, move the meter to token thresholds: amber "quality fading" at **150K**, red "dumb zone" at **300K**, and a compact toast at **500K** instead of 900K. The measured knee for 2026 frontier models sits near **128K to 256K tokens** on multi needle recall, and coding and agent tasks degrade earlier than recall tests show. The "stay under 30 to 40%" rule is practitioner opinion from a 200K window era, never measured, and its own author now quotes tokens. No long context numbers exist yet for Opus 5.5, Sonnet 5.5, Fable 5.1 or Haiku 4.5, so the best Claude evidence is Opus 4.6 and Sonnet 4.6 from February 2026. Treat every threshold below as a defensible product choice, with a per model override, and not as a vendor specification.

## Every vendor's recall curve bends between 128K and 256K tokens

Anthropic describes context rot as "a performance gradient rather than a hard cliff" and publishes no threshold in tokens or percent ([Anthropic, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); [Context windows doc, read 2026-10-07](https://platform.claude.com/docs/en/build-with-claude/context-windows)). The only test with cross vendor numbers at 256K, 512K and 1M is OpenAI MRCR v2 (8 needle), a multi round coreference recall test. Most of its 2026 numbers are vendor reported, with different reasoning settings, so compare shapes, not exact points ([yage.ai survey, 2026-03-15](https://yage.ai/share/long-context-benchmark-en-20260315.html)).

| Model (all 1M windows) | Up to 128K | 256K | 256K to 512K | 1M | Evidence class |
|---|---|---|---|---|---|
| Claude Opus 4.6 (Feb 2026) | n/a | **93.0%** | n/a | **76.0%** | vendor |
| Claude Sonnet 4.6 (Feb 2026) | n/a | 90.3% | n/a | 65.8% | vendor |
| Claude Sonnet 4.5 (2025) | n/a | 10.8% | n/a | 18.5% | vendor |
| GPT-5.4 (Mar 2026) | 86.0% (64K to 128K) | 79.3% (128K to 256K) | **57.5%** | **36.6%** | vendor |
| Gemini 3 Pro (Nov 2025) | 77.0% | 45.4% | n/a | 24.5% | 128K vendor, rest independent |
| Gemini 3.1 Pro (Feb 2026) | 84.9% | n/a | n/a | 26.3% | vendor |
| GPT-6 Astra (Sep 2026) | 100% | 100% | 100% | 96.3% | vendor, unverified |

Sources: [yage.ai, 2026-03-15](https://yage.ai/share/long-context-benchmark-en-20260315.html) for all rows except GPT-6 Astra, which comes from [computingforgeeks, Sep 2026](https://computingforgeeks.com/gpt-6-astra-released-features-benchmarks/) because openai.com blocked direct reads.

The table shows three facts. First, **GPT-5.4 is flat to about 256K, then loses 22 points by 512K and 43 more by 1M**, so its knee sits at about 25% of its window. Second, **Claude 4.6 holds above 90% at 256K** and loses only 17 to 25 points by 1M, which is the flattest verified curve. Third, models with the same 1M window differ by 40 to 50 points at 1M, so long context training, not window size, drives the curve. A May 2026 aggregator snapshot of Context Arena shows the same gap, with a top score of **91.7% at 128K but only about 50.5% at 1M** ([BenchmarkList, 2026-05-06](https://benchmarklist.com/benchmarks/context_arena/)). The GPT-6 Astra claim of 96.3% at 1M is a jump from 36.6% six months earlier, and no independent run confirms it.

Anthropic's Opus 5.5 launch (2026-09-22) gives no MRCR, GraphWalks or needle results ([Anthropic](https://www.anthropic.com/claude-opus-5-5)). The current docs list Opus 5.5, Sonnet 5.5, Fable 5.1 and Haiku 5.5 at 1M, and Haiku 4.5 stays at 200K ([Context windows doc](https://platform.claude.com/docs/en/build-with-claude/context-windows)). I found no long context score for Haiku 4.5. Newer Claude models are probably no worse than Opus 4.6, but this is an inference, not a measurement.

## Harder tasks degrade at 32K to 128K, well before recall does

Simple needle retrieval is close to solved at 1M, so it overstates usable context. Once a benchmark removes literal word overlap, drops come early: in NoLiMa, **11 of 13 models fall below half their short context score at 32K**, and GPT-4o drops from 99.3% to 69.7% ([NoLiMa, ICML 2025](https://proceedings.mlr.press/v267/modarressi25a.html)). Chroma tested 18 models in July 2025 and found that every model degrades with length, even on simple tasks, and that one distractor already lowers accuracy ([Chroma, 2025-07-14](https://www.trychroma.com/research/context-rot)). Du et al. show drops of **13.9% to 85% on math, QA and code** inside the claimed windows, even when filler is whitespace or masked ([arXiv 2510.05381, Oct 2025](https://arxiv.org/abs/2510.05381)). That result points to raw length itself as a cause, which means removing tokens helps more than reordering them.

Code repair falls much harder than code questions. In LongCodeBench, Claude 3.5 Sonnet bug fix success falls from **29% at 32K to 15% at 128K and 3% at 256K**, while multiple choice repo QA for GPT-4.1 stays flat to 1M ([LongCodeBench, May 2025, rev. Oct 2025](https://arxiv.org/html/2505.07897v2)). Multi hop questions degrade about twice as fast as single hop ones for the same added context ([arXiv 2603.15723, Mar 2026](https://arxiv.org/abs/2603.15723)). At 1M tokens, Opus 4.6 and GPT-5.2 score about 71% on one hop GraphWalks but only about 40% on multi hop BFS ([yage.ai, 2026-03-15](https://yage.ai/share/long-context-benchmark-en-20260315.html)). A Claude Code session mixes code repair, multi step reasoning and many distractors, so it follows these steeper curves.

Direct agent evidence is thin but points the same way. LOCA-bench shows agent accuracy falling quickly as environment context grows, and context management strategies recover much of the loss ([arXiv 2602.07962, Feb 2026](https://arxiv.org/abs/2602.07962)). A small Codex study passed 8 of 10 runs with about 11K characters of clean context but only 3 of 10 with about 299K characters, a trend result with p = 0.07 ([Pith review of arXiv 2607.17937, Jul 2026](https://pith.science/paper/2607.17937)). Opus 4.6, GPT-5.4 and Gemini 3.1 acting as monitors missed a dangerous coding action **2 to 30 times more often after about 800K tokens** of benign transcript ([arXiv 2605.12366, May 2026](https://arxiv.org/abs/2605.12366)). On SWE-bench Verified, simple masking of old tool output halves cost and matches or beats the raw agent on solve rate ([JetBrains, arXiv 2508.21433, Aug 2025](https://arxiv.org/abs/2508.21433)). Anthropic reports a 29% gain from context editing on an internal agentic search eval, but gives no baseline or sample size ([Anthropic, 2025-09-29](https://claude.com/blog/context-management)).

No study plots Claude Code solve rate against tokens used within a session. This is the largest gap in the evidence, and it means any meter threshold for coding is a judgment built from neighbouring data.

## The 30 to 40 percent rule is a 200K era opinion, never measured

Dex Horthy of HumanLayer is the source of both the "dumb zone" term and the 40% line. His August 2025 essay advised "keeping utilization in the 40%-60% range", with no data, and quoted a usable window of about 170K tokens ([HumanLayer ACE essay, Aug 2025](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md)). In his November 2025 AI Engineer talk he said "around the 40% line" with the hedge "depending on your task" ([Quevin transcription, 2025-12-13](https://www.quevin.ai/blog/2025-12-13-context-engineering-smart-zone)). On a 200K window, 40% is about 70K to 80K tokens. The 30% figure for 1M windows comes from a community tool, the dumb-zone project, which calls its own thresholds "opinionated" ([dumb-zone README](https://github.com/dumb-zone/dumb-zone/blob/main/README.md)).

When 1M windows became the default in 2026, practitioners, Horthy included, moved to absolute tokens. The table separates measured data from opinion.

| Claim | Number | Kind | Source, date |
|---|---|---|---|
| Horthy, ACE essay | 40% to 60% of a 200K window | opinion | [HumanLayer, Aug 2025](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) |
| Horthy, AI Engineer talk | "around the 40% line" | opinion | [Quevin, 2025-12-13](https://www.quevin.ai/blog/2025-12-13-context-engineering-smart-zone) |
| Horthy, 1M models | 300K to 400K "when it feels right", about 100K on smaller models | opinion | [Pragmatic Engineer, 2026-07-15](https://newsletter.pragmaticengineer.com/p/context-engineering-with-dex-horthy) |
| Matt Pocock, Opus 4.6 1M | dumb zone above 100K | anecdote | [X post, 2026-03-19](https://x.com/mattpocockuk/status/2034572011175907474) |
| Code With Andrea | smart zone in the first ~100K | opinion | [codewithandrea.com, 2026-07-14](https://codewithandrea.com/articles/keep-coding-agent-smart-zone/) |
| WorkOS | compact at 256K, a "defensible quality-first starting point" | opinion | [WorkOS, 2026-08-14](https://workos.com/blog/coding-agent-context-window-compaction-settings) |
| Cognition, Devin on Sonnet 4.5 | 1M beta capped at 200K | vendor practice | [Cognition, 2025-09-29](https://cognition.com/blog/devin-sonnet-4-5-lessons-and-challenges) |
| MRCR knee, 2026 frontier | 128K to 256K | measured, mostly vendor | [yage.ai, 2026-03-15](https://yage.ai/share/long-context-benchmark-en-20260315.html) |
| Claude Opus 4.6 recall | 93% at 256K, 76% at 1M | measured, vendor | [yage.ai, 2026-03-15](https://yage.ai/share/long-context-benchmark-en-20260315.html) |
| Monitor miss rate | 2x to 30x after ~800K | measured, independent | [arXiv 2605.12366, May 2026](https://arxiv.org/abs/2605.12366) |

The heuristic is not validated, but it is not wrong in spirit. Practitioner numbers cluster in a band of **100K to 200K for a first warning and 300K to 400K for a hard stop** on 1M windows. That band agrees with the measured MRCR knee. The current meter's red line at 400K sits at the top of opinion and above every measured knee.

## Absolute tokens fit the evidence better than percent of window

Most results tie degradation to token counts that hurt models with very different windows. NoLiMa drops cluster at 32K for windows from 128K to over 1M ([ICML 2025](https://proceedings.mlr.press/v267/modarressi25a.html)). Du et al. find the drop persists with whitespace filler, which points to length, not fill fraction ([arXiv 2510.05381](https://arxiv.org/abs/2510.05381)). A pure percent rule therefore under warns on 1M windows: a 200K session is only 20% full, yet it sits inside the decline zone for GPT-5.4 and Gemini 3.x.

One result supports a percent component. Veseli et al. find that the "lost in the middle" shape is strongest up to 50% fill, and past 50% a distance to end bias takes over ([arXiv 2508.07479, COLM 2025](https://arxiv.org/abs/2508.07479)). Open models also reach effective lengths of about half their training length on RULER ([An et al., ICLR 2025](https://arxiv.org/html/2410.18745v1)). So a hybrid rule fits best: absolute token tiers, capped by a fraction of the window for small windows.

Four Claude Code facts shape the meter. First, native 1M models auto compact at **about 967K tokens** by default, so Claude Code enforces no quality limit and the meter is the only cue ([Claude Code model config](https://code.claude.com/docs/en/model-config)). Second, Anthropic says "the model is at its least intelligent point when compacting", so a late compaction is also a weak one ([Anthropic, 2026-04-15](https://claude.com/blog/using-claude-code-session-management-and-1m-context)). Third, Opus 4.7 and later, Sonnet 5.5 and Fable 5.1 no longer receive injected token budget tags, so the model itself gets no fill signal ([Context windows doc](https://platform.claude.com/docs/en/build-with-claude/context-windows)). Fourth, newer models keep prior thinking blocks in context, so the count grows faster per turn ([Context windows doc](https://platform.claude.com/docs/en/build-with-claude/context-windows)).

The current 90% toast fires at 900K tokens, only about 67K before auto compaction. At that point monitors miss far more ([arXiv 2605.12366](https://arxiv.org/abs/2605.12366)) and compaction runs at its weakest. The toast is too late to be useful. One more caveat: Opus 4.7 introduced a new tokenizer, and 1M tokens now hold about 555K words instead of about 750K ([Opus 5.5 overview](https://platform.claude.com/docs/en/models/opus-5-5/overview)). Token thresholds are not comparable across that boundary, but attention cost scales with tokens, so tokens stay the right unit.

## Recommended thresholds for the ClaudeDeck context meter

Show the token count as the main figure, for example "312K", and the percent of window as secondary text. Set each threshold as the smaller of an absolute token tier and a fraction of the window. This single rule gives sensible values for both 1M and 200K windows.

| Level | Rule | 1M window (Opus 5.5, Sonnet 5.5, Fable 5.1, Opus 4.6+) | 200K window (Haiku 4.5, Sonnet 4.5, 1M disabled) | Basis |
|---|---|---|---|---|
| Green | below amber | under 150K | under 70K | flat region of every MRCR curve |
| Amber "quality fading" | min(150K, 35% of window) | **150K** | **70K** | end of the GPT-5.4 flat region, practitioner 100K camp, Horthy's 40% of ~170K |
| Red "dumb zone" | min(300K, 50% of window) | **300K** | **100K** | past every vendor's 256K knee, WorkOS 256K, Horthy's 300K lower bound and 100K for smaller models, 50% fill position shift |
| Toast "compact or clear now" | min(500K, 75% of window) | **500K** | **150K** | 50% fill on 1M, GPT-5.4 at 57.5% in this band, room for a good compaction before 967K or the 200K boundary |

Link each level to an action from Anthropic's own guidance. At amber, suggest /rewind for failed attempts and subagents for bulky output. At red, suggest a steered /compact or a /clear with a handoff file. At the toast, offer to set `/autocompact 500k`, so Claude Code compacts on its own before quality falls further ([Claude Code model config](https://code.claude.com/docs/en/model-config)). On Haiku 5.5, red at 100K also matches the point where prompt pricing rises ([Context windows doc](https://platform.claude.com/docs/en/build-with-claude/context-windows)).

Keep the tiers in a per model table, not in code constants. The Claude 4.6 curve is already much flatter than GPT-5.4 and Gemini 3.x, and newer models will probably push the knee further out. When independent MRCR or agent results for Opus 5.5 or Sonnet 5.5 appear, raise the 1M tiers if they hold above 90% at 512K. Until then, these values lean cautious, because the cost of an early nudge is small and the cost of a poisoned session is a full restart.

## What the session does predicts failure better than its size

Added 2026-11-01. A token count says when the risk rises; it does not say whether this session has gone wrong. Four observable signs have direct evidence, and the meter now watches for each one (`hooks/signals.ts`).

**Corrections in a row.** Laban, Hayashi, Zhou and Neville gave the same tasks to frontier models in one prompt and spread over several turns. Multi-turn scores fell by **39% on average**, mostly from a **112% rise in unreliability**, not a loss of skill. Models make early assumptions and "get lost and do not recover", already at two turns. A recap at the end only partly helped (GPT-4o 76.6 vs 59.1 sharded, 93.0 single prompt), while all the instructions in one prompt scored about **95% of single-turn** ([arXiv 2505.06120, May 2025, ICLR 2026](https://arxiv.org/abs/2505.06120)). Anthropic's own rule is "after two failed corrections run /clear and write a better prompt" ([best practices](https://code.claude.com/docs/en/best-practices)). The meter counts prompts that correct the last answer and speaks at two in a row.

**Loops.** Breunig names four ways long contexts fail: poisoning, distraction, confusion and clash. A poisoned or distracted agent repeats itself: Gemini 2.5 playing Pokémon began to repeat past actions "beyond 100k tokens", which he flags as anecdotal ([How Long Contexts Fail, 2025-06-22](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html)). The meter flags the same call failing three times within twelve calls, and an edit that puts back what an earlier edit took out.

**Idle near the cache expiry.** The prompt cache lasts about an hour on a subscription; past it, the next message re-reads the whole context uncached, and Claude Code itself compacts an idle session past about 200K ([best practices](https://code.claude.com/docs/en/best-practices)). The meter warns five minutes before the hour when the context holds 200K or more, and lets the engine's idle compaction through instead of holding it.

**"Done" late in a long context.** Xue ran a coding agent on the same audit task with clean and long contexts (about 11K vs 299K characters). Strict success fell from **8/10 to 3/10** (p = 0.07, small), while requirement coverage stayed above 92%: the failures were quiet omissions. **38 of 44 failed rows still closed with an explicit claim of success** ([arXiv 2607.17937v2, Aug 2026](https://arxiv.org/html/2607.17937v2)). Past the dumb-zone mark, the meter adds one check-it note per context when Claude says it is done.

Two more results back the direction without a signal of their own. On SWE-bench Verified, "successful agentic trajectories typically remain under 20k-30k tokens", and success comes from splitting work into short-context steps ([Raju et al., arXiv 2602.16069, Feb 2026](https://arxiv.org/abs/2602.16069)). Removing distractors keeps or raises long-context scores while blind truncation lowers them, so moving bulky output out of context beats cutting it ([Arjmandi, arXiv 2608.03297, Aug 2026](https://arxiv.org/abs/2608.03297)). Tool count also matters: a small Llama failed with 46 tools and succeeded with 19 ([Breunig](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html)), but frontier-model thresholds are practitioner estimates, so the meter does not warn on it.

The correction and "done" detectors are word patterns, so they miss some cases and catch a few wrong ones. Each sign clears on the next prompt and costs one toast, so a false alarm is cheap.

## Conclusion

The real finding is that "percent of window" was a proxy that worked only while every Claude Code window was 200K. Once windows reached 1M, the same percent moved the warning from about 80K to 400K tokens, while measured degradation stayed tied to token counts near 128K to 256K. A meter that keeps percent as its main unit will drift further from reality with each larger window.

The open question for 2027 is not where recall fails, but where coding judgment fails. Recall at 256K is close to solved for the best models, yet no study measures Claude Code success against session length. A meter that logs session token counts beside outcomes, such as reverts, /rewind use or failed tests, would produce the first real data on this question.
