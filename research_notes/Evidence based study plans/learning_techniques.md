# Core learning-science techniques for a university study plan: spacing, retrieval practice, successive relearning, interleaving

Notes compiled 2026-10-10. Conventions: g = Hedges' g, d = Cohen's d, RI = retention interval (time from the LAST study session to the test), gap = time between two study sessions of the same material, k = number of effect sizes. "Verified in full text" means I read the number in the paper itself; otherwise the source is an abstract or a secondary summary and is labelled as such.

---

## 1. Spacing: what is the optimal gap between study sessions as a function of time to the test? Is expanding better than uniform?

### Takeaway
The best gap is not a fixed number: it grows with the retention interval but shrinks as a proportion of it, from roughly 20-40% of a 1-week delay to 5-10% of a 1-year delay (Cepeda et al., 2008), and the penalty for a gap that is too short is far larger than for one that is too long. Expanding schedules have no reliable advantage over uniform ones (Latimier et al., 2021); what matters is that sessions are spaced at all and that there are several of them.

### Cited Findings

**Cepeda et al. (2006) meta-analysis** — Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354-380.
- Scope: "839 assessments of distributed practice in 317 experiments located in 184 articles." Central conclusion: "ISI and retention interval operate jointly to affect final-test retention; specifically, the ISI producing maximal retention increased as retention interval increased." (abstract) — [Cepeda et al. 2006, doi:10.1037/0033-2909.132.3.354](https://doi.org/10.1037/0033-2909.132.3.354)
- Limitation stated by the same authors two years later: of the 400+ reports reviewed, "only about a dozen of these looked at RIs as long as 1 day, with just a handful examining RIs longer than 1 week." The meta-analysis is therefore dominated by short-interval, verbal-recall lab tasks. — [Cepeda et al. 2008, p. 1095](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)

**Cepeda et al. (2008) "temporal ridgeline"** — Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science, 19*(11), 1095-1102. All numbers below verified in full text.
- Design: 1,354 adults from an internet panel (mean age 34, range 18-72, 72% female; NOT a student sample), 26 gap-by-RI conditions. Material: 32 obscure trivia facts with one-word answers (simple facts, not course material). Session 1: learn to a criterion of one correct recall per fact (61-96 questions answered to reach it). Session 2 (after the gap): each fact tested twice with the correct answer shown for 4 s. Final test after RI of 7, 35, 70 or 350 days, no feedback. Gaps tested: 0, 1, 2, 4, 7, 11, 14, 21, 35, 70, 105 days (subset per RI). — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Best tested gaps for recall at RI = 7, 35, 70, 350 days: 1, 11, 21, 21 days. Spline-interpolated optimal gaps for recall: "approximately 3, 8, 12, and 27 days (corresponding to 43%, 23%, 17%, and 8% of the RIs, respectively)"; for recognition (multiple choice): 1.6, 7, 10, 25 days (24%, 19%, 14%, 7%). — [Cepeda et al. 2008, p. 1099](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Abstract summary: "the optimal gap declined from about 20 to 40% of a 1-week test delay to about 5 to 10% of a 1-year test delay." — [Cepeda et al. 2008](https://pubmed.ncbi.nlm.nih.gov/19076480/)
- Size of the effect with study time held constant: optimal gap vs zero gap gave "a 64% increase in final recall, d = 1.1, and a 26% increase in final recognition, d = 1.5." By RI (7, 35, 70, 350 days) the recall improvement at the optimal gap over the zero-day gap was 10%, 59%, 111% and 77%; recognition improvement 1%, 10%, 31%, 60%. The benefit of spacing is therefore small for a test 1 week away and large for tests 5+ weeks away. — [Cepeda et al. 2008, p. 1099](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Asymmetry: "although there are costs to using a gap that is longer than the optimal value, these costs are much smaller than the costs of using too short a gap ... as the gap increases, accuracy increases steeply and then declines much more gradually." — [Cepeda et al. 2008, p. 1101](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Earlier lab benchmark (150 participants, final test 6 months after the second session, gaps 10 min to 6 months): recall "was best for a 1-month gap", which if linear "would imply that about a 15 to 20% ratio of gap to RI optimizes retention, but linearity cannot be assumed." This is the origin of the popular "10-20% of the retention interval" rule. — [Cepeda et al. 2008, p. 1096](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Published fitted surface (R² = .98): recall = A(bt + 1)^(-R), with A = p + (1 - p)e^(-ag) and R = 1 + c[ln(g + 1) - d]², g = gap in days, t = test delay in days; b = 0.011, p = 0.760, a = 0.017, c = 0.092, d = 3.453. The authors say other functions fit about as well. On this surface the optimal gap for a 350-day RI is 23 days (7% of RI). — [Cepeda et al. 2008, p. 1099](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)
- Authors' practical conclusion: "if you want to know the optimal distribution of your study time, you need to decide how long you wish to remember something"; compressing a topic into one week of a course produces "misleadingly high levels of immediate mastery that will not survive." — [Cepeda et al. 2008, p. 1101](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)

**Spacing with lecture material (university)** — Kapler, I. V., Weston, T., & Wiseheart, M. (2015). Spacing in a simulated undergraduate classroom: Long-term benefits for factual and higher-level learning. *Learning and Instruction, 36*, 38-45.
- 169 undergraduates heard a simulated science lecture, did an online review 1 day or 8 days later, and were tested 5 weeks after the review. The 8-day review gave better final performance on both factual and higher-level (application) questions. (Abstract only; effect sizes not retrieved.) 8 days / 35 days = 23%, matching the Cepeda 2008 optimum for a 35-day RI. — [Kapler et al. 2015](https://www.yorku.ca/ncepeda/publications/KWW2015.pdf)

**Expanding vs uniform** — Latimier, A., Peyre, H., & Ramus, F. (2021). A meta-analytic review of the benefit of spacing out retrieval practice episodes on retention. *Educational Psychology Review, 33*, 959-987.
- 29 studies; 39 effect sizes for spaced vs massed retrieval practice and 54 for expanding vs uniform. Spaced vs massed retrieval: g = 0.74 (strong). Expanding vs uniform: no significant difference (g = 0.034 as reported in summaries of the abstract). Moderator: the more test exposures, the more the expanding schedule tends to help relative to uniform. Authors conclude that the belief that inter-retrieval intervals should progressively increase is not supported. (Abstract and secondary summaries; full text not accessed.) — [Latimier et al. 2021](https://link.springer.com/article/10.1007/s10648-020-09572-8); abstract mirror [NYU IFP](https://ifp.nyu.edu/?p=1511228)
- Cepeda et al. (2006) also examined expanding interstudy intervals as one of their questions (abstract); they did not report a clear advantage in the abstract. — [Cepeda et al. 2006](https://doi.org/10.1037/0033-2909.132.3.354)

**Meta-analytic size of distributed practice overall**
- Donoghue & Hattie (2021) re-analysed the studies in Dunlosky et al. (2013): distributed practice d = 0.85 (150 effects), the largest of the ten techniques; for university samples d = 0.89 (115 effects). — [Donoghue & Hattie 2021, *Frontiers in Education, 6*, 581216](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)
- Dunlosky et al. (2013) rated distributed practice "high utility" (one of only two techniques so rated). — [APS summary of Dunlosky et al. 2013](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- IES practice guide (Pashler et al., 2007), Recommendation 1 "Space learning over time": review key content "after a delay of several weeks to several months after initial presentation"; level of evidence rated Moderate. — [Pashler et al. 2007, NCER 2007-2004](https://dww-library-files.wested.org/files/5198508.pdf)
- Practical dose suggested by Dunlosky: "For any given class, two short study blocks per week may be enough to begin studying new material and to restudy previously covered material." — [Dunlosky 2013, *American Educator*, Fall 2013](https://www.aft.org/sites/default/files/dunlosky_0.pdf)

### Inferences
- Translating Cepeda 2008 to exam horizons (my interpolation between their four RIs; the ratio is gap / RI where RI runs from the last review to the exam):

  | Time from last review to exam (RI) | Optimal gap / RI (recall) | Suggested gap before that last review | Basis |
  |---|---|---|---|
  | 1 week | ~40% (range 20-40%) | 1-3 days | measured (best tested gap 1 day; interpolated 3 days) |
  | 2 weeks | ~30-35% | ~4-5 days | interpolated between 7- and 35-day data |
  | 4-5 weeks | ~23-25% | ~7-8 days | measured at 35 days (8 days); Kapler 2015 agrees |
  | 8-10 weeks | ~17-20% | ~10-12 days | measured at 70 days (12 days) |

- If the plan is anchored on "days from first study to exam" (D) with one review, then gap = D x r / (1 + r). With r from the table: D = 7 days gives a gap of about 2 days; 14 days gives 3-4 days; 28 days gives 5-6 days; 56 days gives about 9 days.
- I evaluated the published fitted surface numerically (my computation, not a published result). It reproduces the paper's 23-day optimum at RI = 350 days, but at short RIs it gives longer optima than the spline estimates (about 5, 8, 12, 16 days for RI = 7, 14, 28, 56 days), and the band of gaps within 1 percentage point of the optimum is wide (e.g. 6-21 days for a 28-day RI). Practical reading: the optimum is a broad plateau, so a scheduler should treat the table above as a minimum gap and not worry about overshooting by up to 2x.
- Rule for software: bias toward longer gaps when in doubt (asymmetric cost), never schedule a same-day repeat as the only review, and do not bother implementing expanding intervals for exam-bounded plans; uniform or roughly uniform spacing with 3+ sessions is equally supported.
- With more than two sessions, no study in this set gives an optimal multi-session schedule. A defensible default is equal gaps sized by the table, with the last review 1-3 days before the exam (the 1-week RI row), because the last-review-to-exam interval is what the Cepeda ratio governs.
- The spacing benefit is small at a 1-week horizon (10% recall gain) and large at 5-10 weeks (59-111%), so spacing rules matter most for midterms/finals and cumulative finals, less for weekly quizzes.

### Gaps
- Cepeda 2008 used two sessions, trivia facts and a general adult sample. There is no equivalent parametric gap x RI study with 3+ sessions and real university course material; the multi-session schedule above is extrapolation.
- I could not open the full text of Cepeda et al. (2006) to quote the effect-size tables (e.g. spaced vs massed accuracy by RI); only the abstract is cited.
- Latimier et al. (2021) g = 0.034 and its CI were not verified in the full text.
- Kapler et al. (2015) effect sizes not retrieved.
- Carpenter, Pan & Butler (2022, *Nature Reviews Psychology, 1*, 496-511, [doi:10.1038/s44159-022-00089-1](https://www.nature.com/articles/s44159-022-00089-1)) is paywalled; I only confirmed its framing (spacing + retrieval combined are best supported; learners avoid them because of mistaken beliefs that learning should feel easy), not specific numbers.

---

## 2. Retrieval practice: effect sizes vs rereading, question format, feedback, and real university courses

### Takeaway
Practice testing beats restudying by about g = 0.5 in the lab (Rowland, 2014: 0.50) and in classrooms (Yang et al., 2021: 0.499 overall, 0.486 in university/college, 0.33 specifically against restudying), and the advantage appears only on delayed tests. Feedback roughly doubles the lab effect (0.73 vs 0.39) and is essential when initial recall is at or below 50%; formats that require producing an answer (short answer, cued recall) are safest, more repetitions help (about +0.08 g per additional quiz), and matching the practice format to the exam format helps.

### Cited Findings

**Roediger & Karpicke (2006)** — Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science, 17*(3), 249-255. Undergraduates (Washington University), prose passages of 256 and 275 words, free recall with NO feedback. Numbers verified in full text.
- Experiment 1 (study-study vs study-test, 7-min periods): after 5 min restudying was better (81% vs 75%); after 2 days testing was better (68% vs 54%, d = 0.95); after 1 week testing was better (56% vs 42%, d = 0.83). The tested group recalled as much after 1 week as the restudy group after 2 days. — [Roediger & Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)
- Experiment 2 (N = 180, 30 per cell; SSSS = four study periods, SSST = three study + one test, STTT = one study + three tests): at 5 min SSSS 83% > SSST 78% > STTT 71%; at 1 week STTT 61% > SSST 56% > SSSS 40% (STTT vs SSSS d = 1.26; SSST vs SSSS d = 0.82). Proportional forgetting over the week: 52% (SSSS), 28% (SSST), 14% (STTT). The STTT group read the passage 3.4 times, the SSSS group 14.2 times. — [Roediger & Karpicke 2006, pp. 252-253](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)
- Metacognitive illusion: the SSSS group predicted they would remember better than the SSST (d = 0.54) and STTT (d = 0.61) groups, the reverse of what happened. — [Roediger & Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)

**Rowland (2014), lab meta-analysis** — Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin, 140*(6), 1432-1463. Testing vs restudy only; applied/classroom studies excluded. Numbers verified in full text (author copy).
- Overall g = 0.50, 95% CI [0.42, 0.58] (reported elsewhere as 159 effect sizes from 61 studies). In the "high-exposure" subset (feedback or high initial performance, which equates exposure) g = 0.66 [0.56, 0.75]. Published g = 0.58 [0.49, 0.67] vs unpublished g = 0.25 [0.10, 0.41]. — [Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf)
- Feedback: with feedback g = 0.73 [0.61, 0.86]; without g = 0.39 [0.29, 0.49]. Delayed feedback g = 1.38 (k = 6) vs immediate g = 0.66 (k = 46), flagged by the author as tentative (few studies, confounded with RI). — [Rowland 2014](https://doi.org/10.1037/a0037559)
- Initial retrieval success (no-feedback studies): initial test performance of 50% or less gave no reliable testing effect (g = 0.03, ns); 51-75% gave g = 0.29 [0.08, 0.49]; above 75% gave g = 0.56 [0.42, 0.70]. With feedback the effect was 0.73 regardless of success. — [Rowland 2014](https://doi.org/10.1037/a0037559)
- Practice-test format: cued recall g = 0.61 [0.52, 0.69]; free recall g = 0.29 [0.07, 0.52]; recognition g = 0.29 [0.10, 0.47]. Rowland cautions that cued-recall studies used feedback more often (44% vs 11% of effect sizes). In the high-exposure subset: cued recall 0.72 [0.61, 0.83], free recall 0.81 [0.45, 1.18], both significantly larger than recognition 0.36 [0.19, 0.52]. — [Rowland 2014](https://doi.org/10.1037/a0037559)
- Retention interval: RI of 1 day or more g = 0.69 [0.56, 0.81]; under 1 day g = 0.41 [0.31, 0.51]. — [Rowland 2014](https://doi.org/10.1037/a0037559)
- Material: prose g = 0.58 [0.34, 0.82]; paired associates 0.59 [0.49, 0.70]; single words 0.33 [0.16, 0.50]. Match between practice and final test format was not a significant moderator in this lab data set. — [Rowland 2014](https://doi.org/10.1037/a0037559)

**Adesope et al. (2017)** — Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests: A meta-analysis of practice testing. *Review of Educational Research, 87*(3), 659-701.
- 272 independent effect sizes from 118 articles (about 15,400 participants; summaries give 15,427 or 15,472); overall g = 0.61 (fixed effects; random-effects estimate 0.70 per a secondary summary). Practice tests beat restudying and all other comparison conditions; effects held in both lab and classroom (classroom g = 0.67 per a secondary summary). — [Adesope et al. 2017](https://doi.org/10.3102/0034654316689306); [Learning Scientists summary](https://www.learningscientists.org/blog/2017/2/9-1)
- Format: multiple-choice and mixed-format practice tests produced larger effects than free recall, cued recall and short answer; the feedback advantage was small and not significant. This conflicts with Rowland (2014), who found recall > recognition and a large feedback effect. — [Adesope et al. 2017 via Learning Scientists](https://www.learningscientists.org/blog/2017/2/9-1); conflict noted in [Greving & Richter 2018, *Frontiers in Psychology*](https://www.frontiersin.org/articles/10.3389/fpsyg.2018.02412/full)

**Yang et al. (2021), classroom meta-analysis** — Yang, C., Luo, L., Vadillo, M. A., Yu, R., & Shanks, D. R. (2021). Testing (quizzing) boosts classroom learning: A systematic and meta-analytic review. *Psychological Bulletin, 147*(4), 399-435. Numbers verified in full text.
- 48,478 students, 222 independent studies; overall g = 0.499 [0.442, 0.557]; bias-adjusted estimate g = 0.427; published 0.510 vs unpublished 0.449 (ns difference). — [Yang et al. 2021](https://gwern.net/doc/psychology/spaced-repetition/2021-yang.pdf)
- By comparison condition: vs no/filler activity g = 0.610; vs fewer quiz questions 0.465; vs restudying g = 0.330 [0.256, 0.404] (k = 162); vs other elaborative strategies (concept mapping, note-taking, summarising) g = 0.095. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- By education level: university/college g = 0.486 [0.420, 0.552] (k = 335); high school 0.655; middle school 0.597; elementary 0.328. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Quiz format: matching 0.913 (k = 6); fill-in-the-blank 0.773; short answer 0.638 [0.539, 0.737] (k = 93); multiple choice 0.567 [0.496, 0.638] (k = 270); cued recall 0.316; free recall 0.238 [0.082, 0.394]; mixed formats 0.336. Recognition-type and recall-type quizzes did not differ overall (0.518 vs 0.520). — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Format match: quiz format same as exam format g = 0.531 vs different 0.399 (significant). — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Feedback: corrective feedback g = 0.537 [0.469, 0.604] vs none 0.374 [0.278, 0.471] (significant). — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Repetition: quizzed once g = 0.444; twice 0.601; three or more times 0.642; meta-regression slope +0.083 g per additional test [0.044, 0.122]. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Transfer: tested content g = 0.512; untested content from the same course 0.321; rephrased questions 0.558. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Knowledge type: facts g = 0.524; concepts 0.644; problem-solving/application 0.453. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Timing and setting: post-class quizzes 0.536 vs pre-class 0.186; in-class 0.514 vs out-of-class 0.401 (marginal); treatment longer than a semester 0.624 vs single class 0.385; high-stakes 0.441, not significantly different from low-stakes. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)

**Utility ratings and other syntheses**
- Dunlosky et al. (2013) rated practice testing "high utility" (with distributed practice, the only two). — Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4-58. [doi:10.1177/1529100612453266](https://doi.org/10.1177/1529100612453266); [APS summary](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- Donoghue & Hattie (2021): practice testing d = 0.74 (374 effects); university samples d = 0.80 (278 effects). — [Donoghue & Hattie 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)
- Spaced retrieval vs massed retrieval: g = 0.74. — [Latimier et al. 2021](https://link.springer.com/article/10.1007/s10648-020-09572-8)
- IES practice guide (Pashler et al., 2007): use quizzing to promote active retrieval; evidence rated Strong (as summarised in secondary sources). — [Pashler et al. 2007](https://dww-library-files.wested.org/files/5198508.pdf)
- Dunlosky's advice: students "will benefit most from tests that require recall from memory, and not from tests that merely ask them to recognize the correct answer." — [Dunlosky 2013, *American Educator*](https://www.aft.org/sites/default/files/dunlosky_0.pdf)

### Inferences
- Default item type should be answer-production (short answer / fill-in / cued recall) with immediate corrective feedback. Multiple choice is acceptable (classroom g = 0.57) and should be included when the real exam is multiple choice (format match 0.53 vs 0.40).
- Unprompted free recall of a whole lecture ("brain dump") is the weakest classroom format (0.24) and the weakest lab format without feedback (0.29), but the strongest lab format when feedback/re-exposure is guaranteed (0.81). Rule: only schedule free recall if it is followed by checking against notes.
- Difficulty targeting: without feedback, items recalled at 50% or less yield no benefit. Because the app can always show the answer, feedback should be mandatory; additionally, the first retrieval should come soon enough after the lecture that success is above roughly 50-75%.
- Each item should be retrieved at least 3 times before the exam (0.44, 0.60, 0.64 for 1, 2, 3+ quizzes); gains flatten after 3.
- The honest headline number for "swap rereading for self-testing in a real university course" is about g = 0.33 (Yang, vs restudying) to 0.5; lab figures of d = 0.8-1.3 at one week (Roediger & Karpicke) are upper bounds for prose with heavy restudy controls.
- The app should warn users that retrieval feels worse and scores lower in the short term (5-min test: restudy wins), so in-session performance is not a valid progress metric.

### Gaps
- Adesope et al. (2017) moderator values (format-specific g, feedback g, postsecondary g) were not verified in the full text; only direction is reported here. The specific values "multiple choice 0.70 / short answer 0.48" that circulate online could not be confirmed and should not be quoted.
- The Adesope vs Rowland disagreement on format and feedback is unresolved; a plausible explanation (classroom exams are often multiple choice, so format match favours MC practice) is consistent with Yang's format-match result but was not tested directly in what I read.
- Whether delayed feedback beats immediate feedback is based on k = 6 in Rowland and should not drive design.

---

## 3. Successive relearning (Rawson & Dunlosky): criterion, spacing, and gains in real courses

### Takeaway
Successive relearning means retrieval practice with feedback until each item is recalled correctly, repeated across several spaced sessions. The published prescription is an initial criterion of 3 correct recalls followed by 3 relearning sessions (to 1 correct recall each) at widely spaced intervals; later work shows the relearning sessions carry most of the benefit, so 1 correct recall initially plus more sessions is more time-efficient. In real university courses it raised exam scores by about 10 percentage points and tripled retention a month later.

### Cited Findings

**Rawson & Dunlosky (2011)** — Rawson, K. A., & Dunlosky, J. (2011). Optimizing schedules of retrieval practice for durable and efficient learning: How much is enough? *Journal of Experimental Psychology: General, 140*(3), 283-302.
- 3 experiments, 533 students, conceptual material (key-term definitions), more than 100,000 hand-scored short-answer responses. Items were practised until correctly recalled 1 to 4 times in the initial session, then relearned to 1 correct recall in 1 to 5 later sessions. Tested by cued recall and relearning speed 1-4 months later. — [Rawson & Dunlosky 2011 (abstract)](https://doi.org/10.1037/a0023956)
- "The effects of initial learning criterion and relearning were subadditive ... the effects of initial learning criterion were strong prior to relearning but then diminished as relearning increased. Relearning had pronounced effects on long-term retention with a relatively minimal cost in terms of additional practice trials." — [Rawson & Dunlosky 2011](https://doi.org/10.1037/a0023956)
- Prescription: "practice recalling concepts to an initial criterion of 3 correct recalls and then to relearn them 3 times at widely spaced intervals." — [Rawson & Dunlosky 2011](https://doi.org/10.1037/a0023956)

**Relearning override** — Vaughn, K. E., Dunlosky, J., & Rawson, K. A. (2016). Effects of successive relearning on recall: Does relearning override the effects of initial learning criterion? *Memory & Cognition, 44*, 897-909.
- Swahili-English pairs (vocabulary, lab) learned to an initial criterion of 1-7 correct recalls, then relearned to 1 correct recall at one-week intervals over 4 or 5 sessions. "The substantial benefits of learning to a higher initial criterion during the first session do not persist across relearning sessions", including after a one-month RI. Conclusion: "if relearning is to occur, using extra time to learn to a higher initial learning criterion is not efficient. Instead, students should devote their time to subsequent spaced relearning sessions." — [Vaughn et al. 2016](https://doi.org/10.3758/s13421-016-0606-y)

**Potency** — Rawson, K. A., Vaughn, K. E., Walsh, M., & Dunlosky, J. (2018). Investigating and explaining the effects of successive relearning on long-term retention. *Journal of Experimental Psychology: Applied, 24*(1), 57-71.
- Advantage of successive relearning over single-session learning: ds = 1.52 to 4.19. Effects of the initial within-session lag were large before relearning (ds = 1.07 to 1.87) but vanished after relearning (ds = -0.20 to 0.38). — [Rawson et al. 2018](https://doi.org/10.1037/xap0000146)

**Classroom evidence (university)**
- Rawson, K. A., Dunlosky, J., & Sciartelli, S. M. (2013). The power of successive relearning: Improving performance on course exams and long-term retention. *Educational Psychology Review, 25*, 523-548. Introductory Psychology students used virtual flashcard stacks of 6-8 concepts per unit, in three or more sessions separated by at least one day, starting when the concept was introduced in class; other concepts were studied "business as usual". Exam performance was more than 10% higher for successively relearned concepts than baseline, even though exam questions were application (near-transfer) questions and not definition recall. On a definition test 24 days after the exam, students recalled over 60% of successively relearned concepts vs under 20% of concepts they studied on their own. A spaced restudy-only group and a self-regulated group also beat baseline but by less. — [Dunlosky, Greve, Badali, Wissman & Rawson 2023 chapter, pp. 84-86](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf); original at [Rawson et al. 2013](https://link.springer.com/article/10.1007/s10648-013-9240-4)
- The APS summary describes the same result as "10% higher (a full letter grade)". — [APS Observer](https://www.psychologicalscience.org/observer/teaching-current-directions-studying-psychopathology)
- Janes, J., Dunlosky, J., Rawson, K. A., & Jasnow, A. (2020). Successive relearning improves performance on a high-stakes exam in a difficult biopsychology course. *Applied Cognitive Psychology, 34*(5), 1118-1132: "about a 10% boost" in exam performance. — [chapter summary](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf); [Janes et al. 2020](https://doi.org/10.1002/acp.3699)
- Higham, P. A., Zengel, B., Bartlett, L., & Hadwin, J. A. (2022). The benefits of successive relearning on multiple learning outcomes. *Journal of Educational Psychology, 114*(5), 928-944. Large undergraduate psychology course; after each lecture students practised concepts on three separate days by successive relearning (fill-in-the-missing-term with feedback) or restudy, time on task approximately equated. Successive relearning gave significantly better recall of practised terms 42 days after practice and a smaller but significant benefit at 68 days; "the benefit was minimal for transfer and new questions." Students initially judged restudy more effective and found relearning more anxiety-provoking; after using both, they judged successive relearning more effective and reported less anxiety with it. — [chapter summary, pp. 86-87](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf); [Higham et al. 2022](https://doi.org/10.1037/edu0000693)
- Problem solving: Rawson et al. (2020), college students, four kinds of probability problems, novel isomorphic problem on each attempt; three sessions to 1 correct per kind vs one session to 3 correct per kind. Significant advantage a week later but small (d = 0.28), and performance was about 50% or less. — [chapter summary, p. 87](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- One non-university study: 174 eighth-graders, statistics definitions, 0-3 relearning sessions; with three relearning sessions recall was nearly 60% one month later. Time per concept fell from about 3 minutes initially to about 1 minute by the third relearning session. — [chapter summary, p. 90](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)

**Implementation parameters stated by the authors**
- Procedure: test, self-score, drop the item for this session if correct, otherwise restudy and re-queue it at the end of the stack (so within-session repeats are spaced by other items); return for "two or more subsequent sessions." — [chapter, p. 83](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Time cost: "It may take students 30 to 40 minutes to initially learn to correctly recall eight to ten lengthy definitions, but during the first relearning session, they may need only about 15 minutes, and the next session will likely take fewer than 5 minutes." — [chapter, p. 88](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Stack size: "relatively few (8-10)" conceptual definitions per stack; vocabulary stacks can be longer. — [chapter, p. 91](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Session count vs exam spacing: "if each exam is separated by four weeks and covers a great deal of material, that probably leaves just enough time to relearn materials on two (perhaps three) extra sessions"; before a cumulative final, "one or two relearning sessions near the end of the semester." Example calendar rule: start when the concept is introduced in a lecture, then "three extra sessions separated by 2 days." — [chapter, pp. 88, 91](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Risk: self-scoring must be accurate; overconfident scoring drops items too early and hurts retention (Dunlosky & Rawson, 2012). Writing or typing the answer before checking is recommended. — [chapter, pp. 89-90](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Honest limit from the authors: "research has not yet systematically explored 'how much is enough' for producing (extremely) long-term retention." — [chapter, p. 91](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)

### Inferences
- A scheduling rule consistent with all of the above: Session 0 within about a day of the lecture, criterion 1 correct recall per item (raise to 3 only if fewer than 3 relearning sessions fit before the exam, because a higher initial criterion matters only when relearning is scarce); then 3 relearning sessions to 1 correct recall each, at least 1 day apart, gaps sized using Section 1.
- Budget per stack of 8-10 definitions: about 35 min, then 15 min, then 5 min, then under 5 min; about 60 minutes in total across four sessions. This gives the planner concrete session durations.
- For a 4-week exam cycle the authors' own estimate (2-3 relearning sessions per stack) matches the Section 1 gaps (about 5-8 days). A cumulative final warrants 1-2 booster sessions per old stack.
- The app should require a typed or written response before revealing the answer and should make the self-grading comparison explicit, to counter the overconfidence problem.
- Expect the gains to be largest on questions that directly use the practised knowledge; gains on far transfer and novel problems are small (Higham 2022; Rawson 2020 d = 0.28).

### Gaps
- Rawson & Dunlosky (2022), "Successive relearning: An underexplored but potent technique for obtaining and maintaining knowledge", *Current Directions in Psychological Science, 31*(4) ([link](https://journals.sagepub.com/doi/full/10.1177/09637214221100484)) returned HTTP 403; I could not extract its summary figures.
- I did not read Rawson et al. (2013) or Higham et al. (2022) in full text; exact exam means, SDs and effect sizes come from the authors' own 2023 chapter and the APS summary. The APS summary also says the advantage a month later was "40% higher"; the chapter gives ">60% vs <20%". These are probably the same data described differently, but I could not confirm.
- Tension to flag: the 2011 paper prescribes an initial criterion of 3, while Vaughn et al. (2016) and Rawson et al. (2018) show the initial criterion is overridden by relearning. The 2016 study used vocabulary pairs; it is not confirmed that override is complete for conceptual definitions.
- No study specifies the optimal spacing between relearning sessions; "widely spaced", "at least one day" and "one week" are the values used, not optimised.

---

## 4. Interleaving: where it helps, where it does not, and how to mix topics in a session

### Takeaway
Interleaving has a moderate average effect (g = 0.42) that is highly material-dependent: large for discriminating similar visual categories (g = 0.67), small-to-moderate but with large classroom effects for mathematics and physics problem solving (meta-analytic g = 0.34; d = 0.83 in a 54-class RCT; 50-125% median gains in a university physics course), null for expository text and negative for word lists (g = -0.39). Schedule it for practice problems where the student must choose the method, and for confusable concepts; do not shuffle unrelated reading or vocabulary.

### Cited Findings

**Brunmair & Richter (2019)** — Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin, 145*(11), 1029-1052. Numbers verified in the accepted manuscript.
- 59 studies, 238 effect sizes in 158 samples. Overall g = 0.42, 95% CI [0.34, 0.50]. Trim-and-fill estimate suggesting publication bias: g = 0.29 [0.20, 0.38]. Heterogeneity is high (I² = 77.3%; sample-level effects ranged from -1.37 to 1.85). — [Brunmair & Richter 2019](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)
- By material: paintings g = 0.67 [0.57, 0.77]; naturalistic photographs g = 0.35 [0.16, 0.55]; mathematical tasks g = 0.34 [0.11, 0.57]; expository texts not significant; tastes not significant; words g = -0.39 [-0.64, -0.14] (blocking better). — [Brunmair & Richter 2019](https://doi.org/10.1037/bul0000209)
- Moderators: stronger effect when categories are similar to one another (hard to tell apart) and when items within a category are dissimilar; no moderation by retention interval; no difference between retention and transfer tests (k = 64). Effects were larger in university student samples than in non-student samples. — [Brunmair & Richter 2019](https://doi.org/10.1037/bul0000209)
- Contiguity matters: interleaving effect was significant only when items followed one another immediately (g = 0.73 [0.51, 0.95]) and not when items were temporally spaced (g = 0.22, ns) (k = 17). — [Brunmair & Richter 2019](https://doi.org/10.1037/bul0000209)
- Authors' caution: the non-significant text result and small maths result do "not imply that interleaving is ineffective"; it "can benefit but also harm inductive learning, depending on the implementation", and interleaving "should be used with caution in certain conditions, especially for expository texts and words." — [Brunmair & Richter 2019](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)

**Mathematics and physics problem solving**
- Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020). A randomized controlled trial of interleaved mathematics practice. *Journal of Educational Psychology, 112*(1), 40-52. Preregistered cluster RCT: 54 seventh-grade classes, 787 students, 14 teachers, 5 schools (children, not university). Same problems, different order, over about 4 months; unannounced test 1 month later: interleaved 61% vs blocked 38%, d = 0.83. Meets WWC standards without reservations. Teachers reported interleaved worksheets took longer. — [WWC study page](https://ies.ed.gov/ncee/wwc/Study/88770); [Rohrer et al. 2020](https://Www.Gwern.net/doc/psychology/spaced-repetition/2019-rohrer.pdf)
- Samani, J., & Pan, S. C. (2021). Interleaved practice enhances memory and problem-solving ability in undergraduate physics. *npj Science of Learning, 6*, 32. University introductory physics, two lecture sections, 8 weeks, thrice-weekly homework interleaved vs one topic at a time. On two surprise tests with novel, harder problems, interleaving gave "observed median improvements of 50% on test 1 and 125% on test 2". Students rated interleaving as more difficult and "incorrectly believed that they learned less from it." — [Samani & Pan 2021](https://doi.org/10.1038/s41539-021-00110-x)
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science, 35*, 481-498. College students learned to compute volumes of four solids; blocked practice produced better accuracy during practice, but on a test one week later those who interleaved "did three times better" (as described by Dunlosky). — [Dunlosky 2013, *American Educator*, pp. 16-17](https://www.aft.org/sites/default/files/dunlosky_0.pdf); [Rohrer & Taylor 2007](https://digitalcommons.usf.edu/psy_facpub/1767/)
- Why it works for problems: with blocking students "do not have to figure out what kind of problem they are solving"; with interleaving they "need to first figure out which kind of problem it is and what steps they need to take." — [Dunlosky 2013, *American Educator*](https://www.aft.org/sites/default/files/dunlosky_0.pdf)

**Category learning and the metacognitive illusion**
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science, 19*(6), 585-592. Interleaving paintings by different artists improved classification of new paintings, yet participants "rated massing as more effective than spacing, even after their own test performance had demonstrated the opposite." — [Kornell & Bjork 2008](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Kornell_Bjork_2008_PsychScience.pdf)

**Null and negative results**
- Dunlosky reports studies where interleaving did not help: learning French vocabulary from different categories (blocked = interleaved) and high-school students learning comma-usage rules. — [Dunlosky 2013, *American Educator*, p. 17](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Donoghue & Hattie (2021): interleaved practice d = 0.47 overall (104 effects), d = 0.65 for university samples (79 effects); but high-ability students showed negative effects for interleaved practice (based on very few studies). — [Donoghue & Hattie 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)
- Dunlosky et al. (2013) rated interleaved practice "moderate utility": "promising for math and concept learning, but needs more research." — [Dunlosky 2013, Table 1](https://www.aft.org/sites/default/files/dunlosky_0.pdf)

**How to mix (as described in the primary sources)**
- Dunlosky's recommendation: after each problem type has been introduced, rearrange practice so that "questions and problems from newly taught materials" are interleaved "with those from previous classes." In the classroom studies students already had initial instruction on each type before mixing. — [Dunlosky 2013, *American Educator*, p. 17](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Samani & Pan's interleaved homework alternated topics within each assignment, three assignments per week. — [Samani & Pan 2021](https://doi.org/10.1038/s41539-021-00110-x)

### Inferences
- Rule: interleave only "practice problem" or "discriminate between confusable concepts" activities. Within a problem-practice session draw problems from the current topic plus 2-3 earlier topics from the same course, shuffled so consecutive problems are of different types and the type is not labelled.
- Do a short blocked phase first (a few problems of the new type right after it is taught), then switch to interleaved practice. This is how the positive classroom studies were run; pure interleaving from first exposure is not what was tested.
- Keep interleaved items back-to-back within one session (g = 0.73 contiguous vs 0.22 spaced): the benefit comes from direct contrast, so "one problem on topic A on Monday, one on topic B on Tuesday" is spacing, not interleaving.
- Do not shuffle reading assignments, lecture review of prose, or term-definition lists across unrelated topics (text: null; words: negative).
- Interleaving across different courses (e.g. chemistry then history in one evening) is not what this literature tested; treat it as a time-management choice, not an evidence-based gain.
- Because interleaved homework inherently spaces each topic, classroom effects (d = 0.83) conflate interleaving and spacing. The app gets both by scheduling cumulative mixed problem sets, which is the practical point.
- The app should tell users that interleaved practice will feel harder and produce lower in-session accuracy; otherwise they will revert to blocking.

### Gaps
- The exact Rohrer & Taylor (2007) percentages (commonly quoted as 63% vs 20%) were not verified in the paper; only Dunlosky's "three times better" is cited.
- No meta-analytic estimate exists in what I found for interleaving in university lecture courses outside maths/physics (e.g. biology, law, history concepts). The expository-text result is null with high heterogeneity (I² = 74.4%).
- Optimal mix ratio (how many old topics, what proportion of old vs new problems) is not established; the 2-3 topic suggestion is my inference.
- The Rohrer et al. (2020) RCT is with 12-13-year-olds; the only university classroom study retrieved is Samani & Pan (2021), with two lecture sections of one course.

---

## 5. Low-utility techniques (rereading, highlighting, summarisation): should a plan avoid scheduling them?

### Takeaway
Dunlosky et al. (2013) rated rereading, highlighting/underlining, summarisation, the keyword mnemonic and imagery for text as low utility; in head-to-head tests rereading loses clearly to retrieval on delayed tests (40% vs 61% after a week despite four times as many readings). A plan should not allocate dedicated review blocks to rereading or highlighting; a first reading and spaced rereading are acceptable only as inputs to retrieval.

### Cited Findings
- Five techniques received a low utility rating in Dunlosky et al. (2013), including "summarization, highlighting and underlining, and rereading"; practice testing and distributed practice received the highest rating. — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html); [Dunlosky et al. 2013](https://doi.org/10.1177/1529100612453266)
- Dunlosky's one-line verdicts (Table 1): rereading, "Distributed rereading can be helpful, but time could be better spent using another strategy"; highlighting and underlining, "Not particularly helpful, but can be used as a first step toward further study"; summarisation, "Helpful only with training on how to summarize"; keyword mnemonic, "Somewhat helpful for learning languages, but benefits are short-lived"; imagery for text, "Benefits limited to imagery-friendly text." — [Dunlosky 2013, *American Educator*, p. 20](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Popularity: a survey at an elite university found 84 percent of students studied by rereading notes or textbooks. Rereading "has inconsistent effects": it helps later recall of texts, "does not always enhance students' understanding," and benefits "may not be long-lasting." — [Dunlosky 2013, *American Educator*, p. 19](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Highlighting has "failed to help students of all sorts"; one study found students who highlighted while reading did worse on questions requiring inferences that connect different ideas. — [Dunlosky 2013, *American Educator*, p. 19](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Direct comparison: four study periods (passage read 14.2 times) gave 40% recall after a week vs 61% for one study period plus three recall tests (read 3.4 times); the rereaders forgot 52% over the week vs 14%, yet were the most confident. — [Roediger & Karpicke 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)
- Classroom: quizzing beats restudying by g = 0.330 [0.256, 0.404]. Quizzing was NOT reliably better than other elaborative strategies such as concept mapping, note-taking and summarising (g = 0.095). — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Donoghue & Hattie (2021) effect sizes: rereading d = 0.47 (113 effects), underlining/highlighting d = 0.44 (56), summarisation d = 0.44 (234), the three lowest alongside interleaving; for university samples rereading 0.42, underlining 0.57, summarisation 0.19, keyword mnemonic 0.20. The authors note even the lowest-ranked techniques show positive effects and that most outcomes were surface/factual. — [Donoghue & Hattie 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)

### Inferences
- "Low utility" means low relative to alternatives for the same time, not zero effect. The scheduling implication is substitution: any slot labelled "review notes" or "reread chapter" should be replaced by retrieval (Section 2/3), with reading allowed as (a) the first pass, or (b) the feedback step after a failed retrieval.
- Summarisation is a special case: it is weak for untrained students but Yang's g = 0.095 suggests that well-executed generative activities are close to quizzing. A closed-book summary followed by checking against notes is functionally free recall with feedback and can be scheduled as retrieval.
- Donoghue & Hattie's positive d values for rereading and highlighting are mostly comparisons against doing nothing or a single read, and are not comparable to the head-to-head retrieval-vs-restudy effects; they should not be read as "rereading works about as well as interleaving."
- Highlighting can be kept as an optional first-read annotation that feeds question generation, not as a scheduled activity.

### Gaps
- I did not access the full Dunlosky et al. (2013) monograph, so the per-technique rationale is taken from the first author's own *American Educator* summary and the APS release.
- Donoghue & Hattie's table extraction was partly garbled (the university column was inferred from sample sizes); treat the university-specific d values as approximate.

---

## 6. Elaborative interrogation and self-explanation: moderate-utility techniques worth scheduling?

### Takeaway
Both were rated moderate utility ("promising, but needs more research") by Dunlosky et al. (2013), and meta-analytic effects are medium (self-explanation g = 0.55; elaborative interrogation d = 0.56). They are worth scheduling as the processing step during first study of new material and during worked examples, not as a replacement for spaced retrieval.

### Cited Findings
- Dunlosky's team "rated three additional strategies as promising but stopped short of calling them the most effective": interleaved practice, elaborative interrogation and self-explanation. — [Dunlosky 2013, *American Educator*, p. 15 and Table 1](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Definitions: elaborative interrogation = "generating an explanation for why an explicitly stated fact or concept is true"; self-explanation = "explaining how new information is related to known information, or explaining steps taken during problem solving." — [Dunlosky 2013, *American Educator*, p. 13](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Self-explanation meta-analysis: Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing self-explanation: A meta-analysis. *Educational Psychology Review, 30*, 703-725. 69 effect sizes from 64 reports; g = 0.55, 95% CI [0.45, 0.65]. — [Bisra et al. 2018](https://summit.sfu.ca/item/34322); [BPS Research Digest summary](https://bps.org.uk/research-digest/self-explanation-powerful-learning-technique-according-meta-analysis-64-studies)
- Donoghue & Hattie (2021): elaborative interrogation d = 0.56 (254 effects), self-explanation d = 0.54 (93 effects); university samples 0.58 and 0.60. — [Donoghue & Hattie 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)
- Example of a large effect: on logical-reasoning problems, final test performance was "about 90 percent versus less than 30 percent" for students who self-explained during practice vs those who did not. — [Dunlosky 2013, *American Educator*, p. 18](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- Limits: most elaborative-interrogation research used isolated facts; it depends on prior knowledge (students with little background knowledge may not generate useful explanations) and becomes more useful as students learn more about a topic. Paraphrasing is not self-explanation. — [Dunlosky 2013, *American Educator*, pp. 18-19](https://www.aft.org/sites/default/files/dunlosky_0.pdf)
- IES practice guide: asking deep explanatory questions is one of the two recommendations with the strongest evidence (with quizzing). — [IES research brief on Pashler et al. 2007](https://learningforward.org/wp-content/uploads/2007/12/research-brief.pdf)
- Higher-order retrieval combines the two ideas: Agarwal, P. K. (2019). Retrieval practice & Bloom's taxonomy: Do students need fact knowledge before higher order learning? *Journal of Educational Psychology, 111*(2), 189-209. Higher-order and mixed quizzes improved higher-order test performance; fact quizzes did not. — [Learning Scientists summary of Agarwal 2019](https://www.learningscientists.org/blog/2019/6/27-1)

### Inferences
- Schedule them inside other activities, not as standalone blocks: (a) during the first pass over a lecture, prompt "why is this true?" / "how does this connect to X?" per key claim; (b) during worked examples and problem practice, prompt "explain why this step follows"; (c) write some retrieval items as why/how questions so that retrieval practice is itself explanatory.
- Use them later in a topic or for students with some background, since the benefit depends on prior knowledge; for brand-new material the first step should be comprehension, then explanation prompts.
- These techniques address the main weakness of flashcard-style retrieval (weak transfer to untested and higher-order questions; see Section 7), which is the strongest argument for including them.

### Gaps
- No study retrieved compares elaborative interrogation or self-explanation head-to-head with spaced retrieval practice at equal time over exam-length delays in university courses.
- Bisra et al. (2018) moderator details (e.g. effect by prompt type; one secondary source gives 0.42 for "justify" prompts vs 0.87 for "conceptualize") were not verified in the primary paper.
- Time cost per item is not quantified in the sources I read; Dunlosky et al. (2013) list time demands as a concern for self-explanation, but I did not verify figures.

---

## 7. How much of the benefit survives for complex/conceptual university material vs simple facts?

### Takeaway
Most of it survives for retention of conceptual course content, but the benefit shrinks for deep and far-transfer outcomes. Classroom testing effects are as large for concepts (g = 0.64) as for facts (0.52) and still medium for problem-solving (0.45); spacing held for higher-level lecture questions; successive relearning raised scores on application-type exam questions by about 10 points. However, effects on untested material (0.32), deep outcomes (d = 0.26 vs 0.60 surface), far transfer (0.39 vs 0.61) and novel problem solving (d = 0.28) are clearly smaller, and whether the testing effect holds for very high element-interactivity material is contested.

### Cited Findings
- Classroom testing effect by knowledge type: facts g = 0.524 [0.453, 0.595]; concepts g = 0.644 [0.507, 0.781]; problem-solving g = 0.453 [0.309, 0.596]. Untested material from the same course g = 0.321 vs tested 0.512. University/college g = 0.486. — [Yang et al. 2021](https://doi.org/10.1037/bul0000309)
- Lab testing effect by material: prose g = 0.58, as large as paired associates (0.59) and larger than single words (0.33). — [Rowland 2014](https://doi.org/10.1037/a0037559)
- Donoghue & Hattie (2021), across all ten techniques: surface outcomes d = 0.60 (1,473 effects) vs deep outcomes d = 0.26 (109 effects); near transfer d = 0.61 vs far transfer d = 0.39. Authors warn that most studies measured surface/factual outcomes, so generalising to deeper learning needs caution. No significant decline of effects with delay up to 6 months (0.58, 0.59, 0.56, 0.51). — [Donoghue & Hattie 2021](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full)
- Spacing with lecture content: 8-day vs 1-day review improved both factual and higher-level (application) questions 5 weeks later in undergraduates. — [Kapler et al. 2015](https://www.yorku.ca/ncepeda/publications/KWW2015.pdf)
- Successive relearning of definitions improved performance on exam questions that required applying the concepts (near transfer), by more than 10%. — [Dunlosky et al. 2023 chapter, p. 86](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- But in Higham et al. (2022) the benefit of successive relearning over restudy "was minimal for transfer and new questions", and for probability problem solving the advantage was d = 0.28 with performance around 50% or lower. — [Dunlosky et al. 2023 chapter, p. 87](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-successive-relearning-dunlosky-greve-badali-wissman-rawson.pdf)
- Interleaving: no reliable effect for expository texts; reliable for maths (g = 0.34) and strong in a university physics course on novel, harder problems (median +50% and +125%). — [Brunmair & Richter 2019](https://doi.org/10.1037/bul0000209); [Samani & Pan 2021](https://doi.org/10.1038/s41539-021-00110-x)
- The dispute: van Gog, T., & Sweller, J. (2015). Not new, but nearly forgotten: The testing effect decreases or even disappears as the complexity of learning materials increases. *Educational Psychology Review, 27*, 247-264, argue the effect weakens or vanishes for high element-interactivity material (e.g. worked examples). — [van Gog & Sweller 2015](https://pure.eur.nl/en/publications/not-new-but-nearly-forgotten-the-testing-effect-decreases-or-even/)
- Reply: Karpicke, J. D., & Aue, W. R. (2015). The testing effect is alive and well with complex materials. *Educational Psychology Review, 27*, 317-326: "element interactivity" was not defined measurably, none of the worked-example experiments manipulated it, and the null results involved isolated-word retrieval or immediate massed retrieval. A later Purdue thesis that manipulated complexity directly (intact vs scrambled texts) found retrieval practice benefits regardless. — [Karpicke & Aue 2015](https://link.springer.com/article/10.1007/s10648-015-9309-3); [Purdue thesis](https://docs.lib.purdue.edu/open_access_theses/1355)
- Question level matters: fact quizzes improved fact performance but not higher-order performance; higher-order and mixed quizzes improved higher-order performance. — [Learning Scientists summary of Agarwal 2019](https://www.learningscientists.org/blog/2019/6/27-1)
- Lab-only caveat for the spacing numbers: Cepeda et al. (2008) used 32 trivia facts with one-word answers and a non-student adult sample. — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf)

### Inferences
- Summary table for the report writer (university relevance):

  | Technique | Best overall estimate | Evidence in real university courses | Survives for conceptual material? |
  |---|---|---|---|
  | Retrieval practice | g = 0.50 lab; 0.50 classroom (0.43 bias-adjusted); 0.33 vs restudy | Strong (k = 335 university effects, g = 0.49) | Yes for tested concepts (0.64); weaker for untested (0.32) and far transfer |
  | Spacing | d about 0.85; +59 to +111% recall at 5-10 week delays vs massed | Moderate (few classroom studies; Kapler 2015 simulated lecture) | Yes in the one lecture-based study; parameters come from fact learning |
  | Successive relearning | d = 1.5-4.2 vs single session (lab); about +10 exam points | Moderate (3 course studies, psychology/biopsychology) | Yes for definitions and their application; small for problem solving (d = 0.28) |
  | Interleaving | g = 0.42 (0.29 bias-adjusted); maths 0.34 | Limited (one physics course study at university level) | Problem solving yes; expository text no |
  | Elaborative interrogation / self-explanation | g about 0.55 | Moderate | Designed for conceptual material; depends on prior knowledge |
  | Rereading / highlighting / summarising | Low utility | n/a | Rereading does not reliably improve understanding |

- Because benefits are largest for exactly the content and question type practised, the practice items must be written at the level the exam demands (application/why/how questions, novel problem variants), not only term-definition cards.
- Problem-solving courses need a different activity type (interleaved novel problems with worked-solution feedback) from concept-heavy courses (successive relearning of definitions plus explanatory questions); a single flashcard pipeline will under-serve the former.
- Effect sizes should be communicated conservatively to users: roughly "a third to half a standard deviation" (about half a letter grade to one letter grade on the practised content) is defensible for real courses; lab figures above d = 1 are not.

### Gaps
- The element-interactivity dispute is unresolved in the sources I read; I found no recent (2020+) meta-analysis that settles whether the testing effect shrinks with material complexity. I read only abstracts/summaries of van Gog & Sweller (2015), Karpicke & Aue (2015) and Agarwal (2019).
- No retrieved study measures the combined package (spacing + retrieval to criterion + interleaving + explanation prompts) against business-as-usual study across a full university course with a transfer-heavy final exam.
- Classroom successive-relearning evidence is from psychology and biopsychology courses only; none from STEM problem-solving, law, or humanities essay courses.
- Carpenter, Pan & Butler (2022) reportedly reviews classroom evidence across subjects and ages, but the full text was not accessible, so their assessment of generalisability to complex material is not included.
