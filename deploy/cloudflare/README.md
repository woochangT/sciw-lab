# 고정 공개 미리보기

- 전체: https://sciw-lab-preview.yoodison.workers.dev/
- 교사: https://sciw-lab-preview.yoodison.workers.dev/teacher.html
- 상태: https://sciw-lab-preview.yoodison.workers.dev/api/health

2026-11-02 기존 Mac 기반 Python·게이트웨이·Quick Tunnel 프로세스가 모두 종료된 것을 확인하고, 별도 Worker `sciw-lab-preview`에 공개 화면과 시트 API를 배포했다. 기존 다른 서비스나 터널을 수정하지 않았다. 계정은 Wrangler에서 확인한 Yoodison 개인 계정이며 설정에 account ID를 고정했다.

이 주소에는 8시간 자동 만료나 자정 종료가 없다. Mac·Codex 세션을 종료해도 Cloudflare에서 요청을 처리한다. 이는 클라우드 배포와 현재 기능 확인을 뜻하며 미래의 무중단 측정 결과는 아니다.

## 재배포

```sh
cd deploy/cloudflare
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

Wrangler 4.156.1을 프로젝트에 고정했다. 현재 로그인 계정을 `npx wrangler whoami`로 확인하고 지정된 개인 계정의 이 Worker만 대상으로 배포한다. OAuth 원문/API 키를 소스나 인자에 넣지 않는다. 새 비밀정보는 필요하지 않으며, 수업 분석은 기존 Apps Script URL의 서버 속성을 그대로 사용한다.

`build.mjs`는 루트 인트로·교사 HTML과 필요한 웹 자산만 `.local/cloudflare-site`로 복사한다. 저장소 문서·디자인 원본·시험 도구·시트 기록·`.git`·비밀 파일은 올리지 않는다. symlink와 25MiB 초과 자산은 거절한다. `html_handling: none`을 사용하므로 Worker에서 `/`를 `/index.html`로 명시적으로 연결한다.

## 서버 계약

기존 `/api/sheet/classes`, `/api/sheet/class`, `/api/sheet/analysis` 경로를 유지한다. 두 탭 A:I의 CSV를 8MB/20초로 제한해 읽고, CSV 따옴표·여러 줄·JSON 필드를 보존한다. 전체 원문을 디스크나 배포 자산에 저장하지 않는다. 조회 실패를 빈 반/예시로 바꾸지 않는다. API 응답은 `private, no-store`이다.

반 정규화·게임 분리와 LLM 입력은 기존 `teacher/model.js`, `scope.js`, `evidence.js`를 재사용한다. 브라우저의 임의 답안/집계는 무시하고 선택한 시트 기록으로 분석 자료를 재구성한다. POST는 허용한 수업 화면 Origin·JSON·1024바이트 제한을 적용한다. 기존 Apps Script의 캐시·재생성·호출 상한은 유지하며, AI는 생성/재생성 버튼에서만 요청한다.

Worker 로그에는 실패 종류/HTTP 상태만 기록한다. 답안·API 키를 출력하지 않고 기본 invocation 로그는 끈다. 학생 저장 및 강철솜 평가 API, 시트 권한·기존 교사 키 인증은 변경하지 않았다.

## 검증

클라우드 서버 계약 검사 8개와 기존·교사 JS 63개/Python 22개를 통과했다. 정적 루트 연결, CSV 원문 보존, 두 탭 조회, Python과 동일한 반/게임 범위, AI 입력 재구성, 잘못된 Origin·크기·스코프 거절을 검사한다. `wrangler deploy --dry-run`과 실제 배포를 별도로 확인했다.

공개 주소에서 인트로, 교사 페이지, 실제 시트의 반 목록과 선택한 반의 감자 기록을 확인했다. 로컬 포트 8765/8767이 모두 종료된 상태에서도 이 요청은 동작한다. 자동 검사에는 합성 공급자 응답을 사용하며 실제 모델 정확도 검증과 구분한다.

브라우저에서 실제 표본 반의 감자 수업 요약 생성과 상세 리포트 열기를 확인했다(2026-11-02 16:42 KST). 학생 기록을 추가하거나 기존 Apps Script를 재배포하지 않았다.

설정 근거: [Workers 정적 자산과 바인딩](https://developers.cloudflare.com/workers/static-assets/binding/), [Workers 플랫폼 한도](https://developers.cloudflare.com/workers/platform/limits/).

2026-11-03: `/api/sheet/classes`에 익명 집계 오버뷰를 포함한다. `teacher/insights.js`를 브라우저와 Workers에서 재사용하며, Python은 같은 함수를 Node로 호출한다. 여러 반의 같은 번호를 합치지 않고, 판정 버전과 노트 열람 의미를 구분한다. 오버뷰 응답에는 개별 학생 번호·세션 ID·답안 원문을 넣지 않는다.

2026-11-03 GitHub Pages 연결: `https://woochangt.github.io/sciw-lab/teacher.html`은 정적 호스팅이므로 `teacher/config.js`에서 기존 Workers의 `/api/sheet`를 사용한다. Workers는 자기 Origin과 `https://woochangt.github.io`만 허용하며 와일드카드·쿠키 허용을 사용하지 않는다. 교차 출처 JSON 분석 요청은 `OPTIONS`로 경로별 메서드와 `Content-Type`만 사전 확인한다. 성공·오류 응답 모두 허용된 Origin의 CORS 헤더와 `Vary: Origin`을 반환한다. Origin은 경로를 포함하지 않으므로 허용 단위는 GitHub Pages 계정 출처다. 로컬 미리보기는 기존 로컬 API를 계속 사용한다.

CORS 동작은 [Cloudflare의 공식 예제](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)를 참고했다. 자동 검사는 Pages 조회·분석 사전 요청·합성 분석·오류 응답·허용하지 않은 출처 거부를 포함한다.
