# L0 단원 지도 — 영어의 시작

상태: 제안 (사용자 승인 전). 작성: curriculum-architect, 2026-11-07.
기준: `docs/DESIGN_v2.md` 3-1·3-2·5장·13장, `content/specs/L0-U05.json`(approved, 변경하지 않음), `content/skills.json`, `content/misconceptions.json`.
표기: [근거] = 설계서·승인본에 있는 내용, [가정] = 설계자의 추정, [미검증] = 공식 교육과정이나 학생 데이터로 확인하지 못함.

## 1. 범위와 원칙

- 읽기 트랙만 다룬다. DESIGN 3-1의 L0 "발음 기초"는 이 지도에서 뺀다. 음성은 어휘 카드의 단어 발음만 허용하기 때문이다 [근거: CLAUDE.md 현재 범위].
- 단계 기간은 4~6주(주 6일, 하루 45~60분) [근거: DESIGN 3-1, 추정치]. 단원 8개면 단원당 약 3~5일이다 [가정].
- 졸업 과제는 "3~5단어 문장의 주어·동사·목적어 표시"이다 [근거: DESIGN 3-1]. 졸업 과제를 직접 평가하는 단원은 L0-U05뿐이다.
- 처음 배우는 학생 기준으로 순서를 잡았다. 각 단원은 "먼저 해보고 나중에 설명한다"(13-1)를 따라, 학생이 문장에서 먼저 표시해 본 뒤 설명을 연다 [근거: 13-1; 단원 내부 순서는 명세 작성 때 정한다].
- 문법 단원은 문장 과제(role_tagging 또는 sentence_building)로 끝난다 [근거: DESIGN 3-2]. 다만 "분석기 과제"가 어떤 형태여야 하는지는 미검증이다.
- 오개념 id는 승인본 `content/misconceptions.json`의 여섯 개(L0-U05)를 재사용한다. 새 오개념만 신규로 제안한다.

## 2. 단원 목록

| 순서 | id | 제목 | 목표 skill | 선수 단원·skill | 주요 오개념 | 인터랙션 | 순서 이유 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | L0-U01 | 명사와 동사 알아보기 | noun_identification (신규), verb_meaning (신규) | 없음 | verb_as_noun (신규), noun_as_verb (신규) | role_tagging (V만) | 모든 학생의 첫 단원. 이름 말과 동작 말을 구분해야 U05의 주어·동사 판단이 가능하다. |
| 2 | L0-U02 | 명사 덩어리: 관사와 명사 | noun_phrase_chunk (신규) | L0-U01 / noun_identification | article_detached_from_noun (신규) | sentence_building | U05의 관사 오개념(article_as_word_class_confusion)을 막으려면 관사가 명사와 한 덩어리라는 것을 먼저 알아야 한다. |
| 3 | L0-U03 | 주어가 되는 말: 주격·목적격 대명사 | pronoun_case (신규) | L0-U01 / noun_identification | object_pronoun_as_subject (신규), subject_pronoun_as_object (신규), verb_as_subject (승인본 재사용) | role_tagging (S·O) | 대명사가 명사를 대신한다는 것을 알아야 "I read a book." 같은 U05 문장의 주어를 찾을 수 있다. |
| 4 | L0-U04 | 현재형 동사 모양: 주어에 따라 달라지는 동사 | present_verb_form (신규) | L0-U01 / verb_meaning, L0-U03 / pronoun_case | missing_s_for_third_person (신규), s_on_non_third_person (신규), subject_as_verb (승인본 재사용) | role_tagging (V), 형태 선택은 빈칸 문장 | 주어에 따라 동사 형태가 바뀐다는 것을 U05 전에 보여 준다. 3인칭 단수 -s는 14-6 수 일치와 이어진다. |
| 5 | L0-U05 | 주어·동사·목적어 찾기 (승인됨) | subject_identification, verb_identification, object_identification, svo_word_order | 현재 없음 (U01~U04 추가 제안, 아래 6장) | 승인본 6개 그대로 | role_tagging, sentence_building | 라이브 단원. id와 내용은 바꾸지 않는다. |
| 6 | L0-U06 | be동사 긍정문: am·is·are | be_verb_form (신규), complement_identification (신규) | L0-U04, L0-U05 | complement_as_object (신규), be_form_mismatch (신규) | role_tagging (S·V·C) | DESIGN 3-1의 "be동사" 첫 단계. U05의 "상태를 나타내는 말"을 be동사로 넓힌다. |
| 7 | L0-U07 | be동사 부정·의문문 | negation_be (신규), question_inversion_be (신규) | L0-U06 | question_without_inversion (신규), negation_position_wrong (신규) | role_tagging (S·V) | 의문문에서 주어와 be동사 자리가 바뀌는 것을 처음 배운다. |
| 8 | L0-U08 | 일반동사 부정·의문문 | negation_general_verb (신규), question_do_support (신규) | L0-U04, L0-U07 | do_as_main_verb (신규), does_with_s_on_verb (신규) | role_tagging (S·V) | do·does를 본동사로 착각하지 않도록 be동사 패턴과 대조한다. |

## 3. 선수 관계

```
L0-U01 → L0-U02 ─┐
L0-U01 → L0-U03 ─┼→ L0-U04 → L0-U05 → L0-U06 → L0-U07 → L0-U08
                 ┘   (U04는 U01, U03에도 의존)
```

U05의 `prerequisiteSkills`는 지금 빈 배열이다. U01~U04가 생기면 U05에 `noun_identification`, `verb_meaning`, `noun_phrase_chunk`, `pronoun_case`, `present_verb_form`을 넣는 것을 제안한다. U05는 approved 명세이므로 사용자 승인 없이 바꾸지 않는다(ADR 0002).

## 4. 단원별 설명

### L0-U01 명사와 동사 알아보기 (명세 작성됨: `content/specs/L0-U01.json`)
- 목표: 이름 말(명사)과 동작·상태 말(동사)을 문장에서 구분하고, 그 이유를 한 문장으로 설명한다.
- 문항: 명사 찾기 8문항(정답 명사 1개, 나머지 선택지는 동사), 동사 찾기 6문항(role_tagging에도 사용). 모두 객관식.
- 제한: 대명사, be동사, -s형, 형용사·부사를 쓰지 않는다(U03~U06 범위).
- 근거: 명사·동사 구분은 U05의 주어·동사 오개념(subject_as_verb, verb_as_subject, object_as_verb)의 바탕이다 [근거: U05 명세의 오개념 목록 + 가정].

### L0-U02 명사 덩어리: 관사와 명사
- 목표: a, the가 뒤의 명사와 한 덩어리로 움직인다는 것을 문장 조립으로 확인한다.
- 과제: sentence_building. 칩 세 개(예: [girls] [the] [play])를 보여 주고 바른 어순 문장을 고른다. 오답은 관사를 명사에서 떼어 놓은 배열이다.
- 근거: 승인본 오개념 article_as_word_class_confusion은 관사를 동사처럼 보는 오류다. 관사를 명사와 떼어 보는 오류는 그 앞 단계다 [가정].
- 미검증: 3~5단어 문장에서 관사 덩어리 조립이 학생에게 실제로 어려운지 학생 데이터가 없다.

### L0-U03 주어가 되는 말: 주격·목적격 대명사
- 목표: I, you, he, she, it, we, they는 주어 자리에, me, him, her, us, them은 동작의 대상 자리에 쓴다는 것을 구분한다.
- 과제: role_tagging(S·O). 주어를 가리키는 말, 목적어를 가리키는 말을 고른다.
- 오개념: object_pronoun_as_subject(목적격을 주어로 고름), subject_pronoun_as_object(주격을 목적어로 고름). 둘 다 신규.
- 근거: DESIGN 14-6 "대명사·재귀대명사"가 기출 빈도 4위다(GRAMMAR_PRIORITY). 다만 대명사 교육을 L0에 두는 것은 DESIGN 3-1 L0 목록에 없다 [가정].
- 미검증: 재귀대명사는 L0에서 빼고 주격·목적격만 다룬다는 판단은 설계자 추정이다.

### L0-U04 현재형 동사 모양: 주어에 따라 달라지는 동사
- 목표: 주어가 I/you/복수일 때와 he/she/it 같은 3인칭 단수일 때 동사 형태가 다르다는 것을 말할 수 있다.
- 과제: 형태 선택 문항은 빈칸이 있는 문장을 문항 안에 넣고 연결 문장은 쓰지 않는다(sentenceUse building으로 생성, 아래 미검증 참조). 태깅은 role_tagging(V).
- 근거: 주어·동사 수 일치는 기출 29번 어법 포인트 순위 5위다(GRAMMAR_PRIORITY). 지금 형태만 다루고, 규칙의 적용 범위는 L1~L2에서 넓힌다 [가정].
- 미검증: 3인칭 단수 -s를 L0에서 가르칠지, DESIGN 3-1의 "일반동사" 항목을 L0 뒤쪽으로 미룰지 미정이다.

### L0-U05 주어·동사·목적어 찾기 (승인됨)
- 변경 없음. id, 제목, 오개념, 문항 28개 구성 모두 유지.
- 선수 skill을 U01~U04 완료 후 채우는 것만 제안한다(3장, ADR 0002).

### L0-U06~U08 be동사·부정·의문 (신규 제안, 명세 없음)
- DESIGN 3-1의 L0 핵심 내용("be동사·일반동사, 부정·의문")을 담는다.
- 다만 L0 졸업 과제는 S·V·O 표시뿐이라, 이 세 단원을 L0에 둘지 L1로 미룰지 사용자가 정해야 한다(ADR 0001 결정 3). 지금 순서는 L0에 둔 경우다.

## 5. 근거 구분

| 항목 | 구분 | 내용 |
| --- | --- | --- |
| L0 주제(주어·동사, be·일반동사, 부정·의문), 졸업 과제 | 근거 | DESIGN 3-1 |
| 발음 기초 제외 | 근거 | CLAUDE.md 현재 범위 |
| 인터랙션 종류와 L0 적용 범위 | 근거 | DESIGN 13-2 (role_tagging, sentence_building) |
| 3-2 "문법 단원은 분석기 연습으로 끝난다" | 근거(해석은 미검증) | DESIGN 3-2 |
| U05의 오개념 3개(subject_as_verb, object_as_verb, article_as_word_class_confusion) | 근거 | DESIGN 4-2 예시, 승인본 |
| 대명사·-s 수 일치를 L0에 넣는 것 | 가정 + 기출 빈도 참고 | GRAMMAR_PRIORITY 4위·5위 |
| U01~U04의 구성과 순서 | 가정 | 설계자 판단. U05 명세 unverified가 U01~U04를 예고했을 뿐 내용은 없었다 |
| 신규 오개념 13개(U01 2, U02 1, U03 2, U04 2, U06 2, U07 2, U08 2) | 가정 | 학생 오답 데이터 없음. 예시 문장으로만 검토 |
| 단원당 문항 수, 문장 수, 숙달 기준 | 가정 / DESIGN 5-2 | 파일럿 보정 필요 |
| 공식 교육과정 단원 구성 | 미검증 | 확인할 공식 문서를 찾지 못했다 |

## 6. 승인이 필요한 항목

1. 단원 id: L0-U01~U04는 U05 명세가 예고한 번호를 그대로 쓴다. L0-U06~U08은 새 id다. 사용자 승인 전까지 U01만 명세를 만든다(완료).
2. U05의 `prerequisiteSkills` 변경: approved 명세이므로 사용자 승인 필요(ADR 0002).
3. L0 범위: U06~U08(be·부정·의문)을 L0에 둘지, L1로 미룰지. 졸업 과제와 DESIGN 3-1 L0 목록이 어긋난다(ADR 0001).
4. 스키마 gap: `GenerationSpec.variantGroups[].sentenceUse`에 빈칸 형태 문항용 값이 없다. U04에서 "building"으로 임시 사용한다. 값을 추가할지는 스키마 변경이므로 사용자 승인 사항이다(ADR 0001).
5. 인터랙션 gap: role_tagging에서 한 역할(V만, S만)만 표시하는 모드가 13장에 없다. U01부터 쓰므로 UI 가능 여부를 메인 세션이 확인해야 한다.
6. 어휘 상한: 6000은 2026-11-03 사용자 결정이며, DESIGN 3-3 목록(400개)이 승인되면 교체한다(기존 결정).

## 7. 미검증 목록

- 공식 교육과정 문서로 L0 단원 구성을 확인하지 못했다.
- 신규 오개념 13개의 실제 학생 오류 빈도를 확인하지 못했다.
- 분석기 과제(role_tagging, 문장 조립)가 DESIGN 3-2의 "SentenceAnalyzer 연습"에 해당하는지는 해석 문제다.
- 숙달·보충·혼동 기준은 DESIGN 5-2 v2 값이며 파일럿으로 보정해야 한다.
- 이 지도의 단원 순서가 실제 학생에게 맞는지는 파일럿 전에 검증되지 않았다.
