# 데이터 계약 추가안 (문서만, 미적용)

단계 2 스키마(`lib/schema/`)에 나중에 더할 내용이다. 아직 코드로 만들지 않았다. 스키마 변경은 사용자 승인 사항이므로, 적용할 때 이 문서를 근거로 제안하고 승인을 받는다.

설계서 4장 원칙("P1에서 확정하고 이후에는 필드를 추가만 한다")에 따라 기존 필드는 바꾸지 않고 추가만 한다.

## 1. Question.familyId (추가 필드, 선택)

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `familyId` | Id, 선택 | 이 문항을 만든 ProblemFamily. `variantGroup`과 함께 쓰며, 같은 Family에서 단어·숫자만 바꾼 동형 문항은 같은 `familyId`와 `variantGroup`을 가진다 |

검증 규칙(추가): `familyId`가 있으면 ProblemFamily 정의 파일에 존재해야 한다.

## 2. ProblemFamily (새 모델)

문항을 만드는 틀. 수능 유형용 블루프린트(14-4)와 연결된다.

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `id` | Id | 예: `F-L0-verb-identification` |
| `skills` | Id[] | 이 Family가 묻는 skill |
| `blueprintId` | Id, 선택 | 연결된 블루프린트(`content/blueprints/`). L5 이상 수능 유형에서 사용 |
| `interaction` | Interaction | 13장 인터랙션 종류 |
| `stemPattern` | string | 발문 틀(한국어) |
| `distractorRules` | { misconception 또는 trap, 설명 }[] | 오답 선택지를 만드는 규칙 |
| `variationAxes` | string[] | 동형 문항에서 바꿀 수 있는 요소(단어, 숫자, 문장 길이 등) |
| `constraints` | object | 허용 어휘 단계, 문장 길이 등 |
| `sourceStats` | { file, field }[], 선택 | 수치의 출처(analysis/) |

위치 후보: `content/families/{familyId}.json`. 학생용 빌드에 포함할지는 적용 시 결정한다(미정).

## 3. UnitSpec (새 모델)

curriculum-architect가 쓰는 단원 명세. 양식: `docs/templates/unit-spec.template.json`. 위치: `content/specs/{unitId}.json`.

| 필드 | 형식 |
| --- | --- |
| `unitId`, `levelId`, `title` | Id, LevelId, string |
| `objectives` | string[] |
| `prerequisiteSkills`, `targetSkills` | Id[] |
| `misconceptions` | { id, description, remediation }[] |
| `vocabRange` | { maxLevel, note } |
| `families` | { familyId, questionCount, note }[] |
| `interactions` | Interaction[] |
| `assessmentCriteria` | string[] |
| `status` | UnitStatusValue |
| `unverified` | string[] |

검증 규칙 후보: `unitId`가 `units/`의 Unit id와 같은 형식, `misconceptions[].id`가 `misconceptions.json`에 있거나 같은 명세에서 새로 정의됨, `families[].familyId`가 ProblemFamily에 존재.

## 4. UnitStatus (새 모델)

단원 상태를 한 곳(`content/curriculum/unit-status.json`)에서 관리한다.

| 필드 | 형식 | 뜻 |
| --- | --- | --- |
| `units` | Record<unitId, { status, updatedAt, note? }> | |
| `status` | `specified` → `drafted` → `reviewed` → `approved` → `implemented` | 앞으로만 진행. 되돌릴 때는 note에 이유 |

`approved`로 바꾸는 것은 사람만 한다.

## 현재 처리

`content/specs/`와 `content/curriculum/`은 스키마가 없어서 `validate:content`의 검사 대상에서 빠져 있다(`lib/schema/content-tree.ts`의 `HANDOFF_DIRS`). UnitSpec·UnitStatus 스키마를 적용할 때 이 예외를 없애고 위 규칙으로 검사한다.
