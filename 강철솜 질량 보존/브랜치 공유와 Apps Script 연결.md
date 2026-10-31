# 미션 02 · 브랜치 공유와 Apps Script 연결

`front-end` 브랜치는 미션 02 「늘어난 강철솜」 프로토타입을 main에 합치기 전에 팀이 플레이해 보기 위한 브랜치다. main과 미션 01(`감자 삼투/`)은 건드리지 않는다.

## 1. 이 브랜치에 든 것

| 경로 | 내용 |
| --- | --- |
| `강철솜 질량 보존/web/` | 미션 02 게임 (정적 파일, 미션 01과 파일을 공유하지 않음) |
| `apps-script/Code.gs` | 미션 02 기록과 미션별 LLM 판정을 받도록 고친 백엔드. 미션 01 요청은 예전과 똑같이 처리한다 |
| `강철솜 질량 보존/브랜치 공유와 Apps Script 연결.md` | 이 문서 |

게임 기록은 지금 로컬 모드(`web/js/config.js`의 `API_URL: ''`)라 브라우저에만 쌓인다. 아래 4장을 마치면 테스트 시트로 보낼 수 있다.

## 2. 브랜치 올리기

저장소 협업자 초대를 받은 계정에서 한다.

```bash
git push origin front-end
```

## 3. 플레이 링크

GitHub Pages는 main만 띄우므로, 브랜치는 raw.githack.com 주소로 공유한다. 공개 저장소의 브랜치 파일을 그대로 웹페이지로 열어 주는 무료 서비스라 팀 테스트용으로만 쓴다.

```
https://raw.githack.com/woochangT/sciw-lab/front-end/%EA%B0%95%EC%B2%A0%EC%86%9C%20%EC%A7%88%EB%9F%89%20%EB%B3%B4%EC%A1%B4/web/index.html
```

- 올린 직후 한 번 열어서 한글 폴더 이름과 그림이 제대로 뜨는지 확인한 뒤 공유한다.
- 브랜치에 새로 올린 내용이 바로 안 보이면 몇 분 뒤 새로 고침한다.
- 반 코드는 `TEST`처럼 실제 반과 겹치지 않게 쓴다.

## 4. Apps Script 테스트 연결 (팀 시트는 그대로)

팀 기록 시트와 미션 01이 쓰는 웹 앱 주소는 건드리지 않고, 테스트용 시트와 주소를 따로 만든다.

1. 새 Google 스프레드시트를 만든다 (예: "서술 실험실 기록 · 미션 02 테스트").
2. **확장 프로그램 → Apps Script**를 열고 `Code.gs`를 이 브랜치의 `apps-script/Code.gs`로 통째로 바꾼다. `appsscript.json`도 같은 폴더 것으로 바꾼다.
3. 함수 `setup`을 실행해 권한을 승인한다. `Sessions`, `Attempts` 탭이 생긴다.
4. LLM 판정까지 시험하려면 **프로젝트 설정 → 스크립트 속성**에 `ANTHROPIC_API_KEY`를 넣고, 함수 `testJudgeM02`를 실행해 결과가 로그에 찍히는지 본다.
5. **배포 → 새 배포 → 웹 앱** (실행 사용자: 나, 액세스: 모든 사용자). 나온 `…/exec` 주소를 이 브랜치의 `강철솜 질량 보존/web/js/config.js` `API_URL`에 넣고 커밋한다.
6. 확인: 주소 뒤에 `?action=ping`을 붙여 열면 `{"ok":true,…}`가 나온다. 한 판 플레이한 뒤 `?action=classData&classCode=TEST&missionId=m02`를 열면 방금 기록이 보인다.

## 5. main에 합칠 때

1. `front-end` → `main`으로 PR을 열고 팀이 확인한 뒤 합친다. 합치면 `https://woochangt.github.io/sciw-lab/강철솜 질량 보존/web/`으로 열린다.
2. 팀 Apps Script 프로젝트의 `Code.gs`를 이 브랜치 것으로 바꾸고 **배포 관리 → 편집 → 새 버전**으로 다시 배포한다. 웹 앱 주소는 그대로라 미션 01 `config.js`는 고치지 않는다.
3. 미션 02 `config.js`의 `API_URL`을 팀 웹 앱 주소로 바꾼다.
4. 새 열은 첫 기록이 들어올 때 기존 시트 맨 뒤에 저절로 붙는다. 기존 행과 열 순서는 바뀌지 않는다.

## 6. Code.gs에서 바뀐 것

- **최종 판정 열을 미션별로.** 미션 01은 예전처럼 `finalC`, `finalD`, `finalW1`, `finalW2a`, `finalW2b`, `finalW3`, `finalWB`를 쓴다. 미션 02는 `finalC`, `finalDA`, `finalDB`, `finalW1a`, `finalW1b`, `finalW2a`, `finalW2b`를 쓴다.
- **미션 02 기록 열 추가.** `path`, `hintLevel`, `hintReason`, `sortFirstRight`, `dwConfusion`, `selfPredict`, `selfPredictMatch`, `firstSubmitBeforeHint`, `firstSubmitDiag`, `ownMode`, `ownReward`(Sessions), `choice`, `pass`(Attempts).
- **`extra` 열.** 머리글에 없는 값은 버리지 않고 `extra`에 JSON으로 모은다. 예전에는 머리글에 없는 값이 저장되지 않았다.
- **교사 화면 데이터.** `classData`에 `missionId`를 붙이면 그 미션만 준다. 빼면 미션 01(`m01`이거나 빈 행)만 주므로 미션 01 교사 화면에 미션 02 기록이 섞이지 않는다.
- **LLM 판정.** 상황 설명, 유의어, 오류 유형 목록, 최종 변론 안내를 요청에서 받는다(`context`, `synonyms`, `errorCodes`, `errorGuide`, `defenseNote`). 없으면 미션 01(감자) 값을 쓴다. 미션 02 값은 `web/missions/mission02.js`의 `llm…` 항목에 있다.

가짜 시트로 점검한 결과는 다음과 같다.

- 미션 01 기록: 예전 열에 그대로 들어간다.
- 미션 02 기록: 자기 열과 `extra`에 들어간다.
- 예전 머리글로 만든 시트에 이어 써도 기존 행과 열 순서가 그대로다.
- 미션 01의 LLM 판정 요청 본문은 고치기 전 코드와 한 글자도 다르지 않다.

## 7. 아직 남은 것

- 미션 02 게임에서 LLM 판정을 부르는 코드 (지금은 키워드 판정만, `USE_LLM: false`)
- 교사 히트맵의 미션 02 열
- `감자 삼투/apps-script/Code.gs`는 예전 복사본 그대로 두었다. 맨 바깥 `apps-script/`가 공용 파일이므로, 복사본을 지울지 맞출지 정해야 한다.
